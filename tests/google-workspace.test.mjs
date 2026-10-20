import test from 'node:test'
import assert from 'node:assert/strict'
import {makeGoogleOAuthSession,GOOGLE_SCOPES} from '../server/google-oauth-session.mjs'
import {searchGmail,listDriveFiles,readDriveTextFile} from '../server/google-reader.mjs'
import {attachGoogleRoutes} from '../server/google-routes.mjs'
const clientId='clientid.apps.googleusercontent.com',clientSecret='synthetic-password-do-not-use'
const redirectUri='http://127.0.0.1:3031/api/google/callback'
const id='abcdefghijklmno',sha='abcdefghijABCDEFGHIJ'
const json=(record,status=200)=>({ok:status===200,status,headers:{get:()=>null},text:async()=>JSON.stringify(record)})
function authStub({service='gmail',email='goreecloud@gmail.com',scope=GOOGLE_SCOPES.gmail}={}){
 let now=1000,calls=[]
 const fetcher=async(uri,options)=>{
  calls.push({uri,options})
  if(uri==='https://oauth2.googleapis.com/token')return json({access_token:'simulated-token',token_type:'Bearer',expires_in:3500,scope:'openid email '+scope})
  if(uri==='https://openidconnect.googleapis.com/v1/userinfo')return json({email,email_verified:true})
  throw Error('Unexpected remote request')
 }
 const session=makeGoogleOAuthSession({clientId,clientSecret,redirectUri,now:()=>now,fetcher})
 return {session,calls,advance:ms=>{now+=ms},url:()=>new URL(session.start(service))}
}
test('OAuth defaults off without registered client credentials and never issues grants',()=>{
 const session=makeGoogleOAuthSession({})
 assert.equal(session.configured,false)
 assert.throws(()=>session.start('gmail'),/not configured/)
 assert.equal(session.getToken('gmail'),null)
})
test('separate read scopes and PKCE state are one-time and account verified',async()=>{
 const {session,calls,url}=authStub()
 const link=url(),state=link.searchParams.get('state')
 assert.equal(link.host,'accounts.google.com')
 assert.equal(link.searchParams.get('redirect_uri'),redirectUri)
 assert.equal(link.searchParams.get('code_challenge_method'),'S256')
 assert.equal(link.searchParams.get('access_type'),'online')
 assert.ok(link.searchParams.get('code_challenge').length>20)
 assert.equal(link.searchParams.get('scope'),'openid email '+GOOGLE_SCOPES.gmail)
 assert.equal(link.searchParams.get('login_hint'),'goreecloud@gmail.com')
 assert.equal(session.status().gmail.connected,false)
 const result=await session.finish({state,code:'synthetic-auth-code'})
 assert.equal(result.account,'goreecloud@gmail.com')
 assert.equal(session.getToken('gmail'),'simulated-token')
 assert.equal(session.getToken('google-drive'),null)
 assert.ok(!JSON.stringify(session.status()).includes('simulated-token'))
 assert.ok(calls[0].options.body.includes('code_verifier='))
 assert.ok(!JSON.stringify(session.status()).includes(clientSecret))
 await assert.rejects(()=>session.finish({state,code:'replay'}),/expired or invalid/)
})
test('wrong account, rejected scopes and expired state never connect',async()=>{
 const wrong=authStub({email:'someoneelse@example.com'}),w=wrong.url()
 await assert.rejects(()=>wrong.session.finish({state:w.searchParams.get('state'),code:'oauthcode'}),/authorized GoreeCloud/)
 assert.equal(wrong.session.getToken('gmail'),null)
 const scope=authStub({scope:GOOGLE_SCOPES['google-drive']}),s=scope.url()
 await assert.rejects(()=>scope.session.finish({state:s.searchParams.get('state'),code:'oauthcode'}),/required read scope/)
 const expired=authStub(),e=expired.url()
 expired.advance(301000)
 await assert.rejects(()=>expired.session.finish({state:e.searchParams.get('state'),code:'oauthcode'}),/expired or invalid/)
})
test('disconnect invalidates in-flight authorization and token expiry is fail-closed',async()=>{
 const a=authStub(),u=a.url()
 a.session.invalidate('gmail')
 await assert.rejects(()=>a.session.finish({state:u.searchParams.get('state'),code:'oauthcode'}),/expired or invalid/)
 const b=authStub(),v=b.url()
 await b.session.finish({state:v.searchParams.get('state'),code:'oauthcode'})
 b.advance(3600_000)
 assert.equal(b.session.getToken('gmail'),null)
 assert.equal(b.session.status().gmail.connected,false)
})
test('Gmail search only requests metadata, bounds queries and sanitizes headers',async()=>{
 const calls=[]
 const fetcher=async(uri,options)=>{
  const url=new URL(uri)
  calls.push({url,options})
  if(url.pathname.endsWith('/messages'))return json({messages:[{id,threadId:sha}],resultSizeEstimate:1})
  return json({id,payload:{headers:[{name:'Subject',value:'Review sync'},{name:'From',value:'GoreeCloud <system@example.com>'}]},snippet:'Important update'})
 }
 const result=await searchGmail('token',{q:'is:unread'},fetcher)
 assert.equal(result.messages[0].subject,'Review sync')
 assert.equal(result.readOnly,true)
 assert.equal(calls.length,2)
 assert.ok(calls.every(x=>x.options.method==='GET'&&x.options.redirect==='error'&&x.options.headers.Authorization==='Bearer token'))
 assert.equal(calls[1].url.searchParams.get('format'),'metadata')
 assert.equal(calls[0].url.searchParams.get('maxResults'),'10')
 await assert.rejects(()=>searchGmail('token',{q:'x'.repeat(301)},fetcher),/query/)
})
test('Drive per-file scope lists only scoped metadata and reads strictly sized UTF8',async()=>{
 const calls=[]
 const fetcher=async(uri,opts)=>{
  const u=new URL(uri);calls.push([u,opts])
  if(u.pathname.endsWith('/files'))return json({files:[{id,name:'notes.md',mimeType:'text/plain',size:'8',modifiedTime:'2026-10-20T00:00:00Z'}]})
  if(u.searchParams.get('fields'))return json({id,name:'notes.md',mimeType:'text/plain',size:8})
  return {ok:true,status:200,headers:{get:()=>null},text:async()=> 'Text me!'}
 }
 const files=await listDriveFiles('token',{},fetcher)
 assert.equal(files.scope,'drive.file');assert.equal(files.files.length,1)
 const file=await readDriveTextFile('token',{id},fetcher)
 assert.equal(file.content,'Text me!')
 assert.equal(calls.every(x=>x[1].method==='GET'),true)
 await assert.rejects(()=>readDriveTextFile('token',{id:'../bad'},fetcher),/Invalid/)
})
test('Drive read blocks Google Docs without export, oversized binary and out-of-scope files',async()=>{
 const get=meta=>async()=>json(meta)
 await assert.rejects(()=>readDriveTextFile('token',{id},get({id,name:'Plan',mimeType:'application/vnd.google-apps.document',size:'100'})),/separate export/)
 await assert.rejects(()=>readDriveTextFile('token',{id},get({id,name:'notes.md',mimeType:'text/plain',size:'65537'})),/bounded/)
 await assert.rejects(()=>listDriveFiles('token',{},get({files:[],incompleteSearch:true})),/incomplete/)
 await assert.rejects(()=>listDriveFiles('token',{},async()=>({ok:false,status:403})),/permission/)
})
test('origin protection, session changes, callback response and disabled writes',async()=>{
 const handlers=new Map()
 const app={get:(p,fn)=>handlers.set('GET '+p,fn),post:(p,fn)=>handlers.set('POST '+p,fn)}
 const {session,url}=authStub()
 let pendingRelease
 const deferred=new Promise(resolve=>{pendingRelease=resolve})
 attachGoogleRoutes(app,new Set(['http://127.0.0.1:3031']),{session,port:3031,readGmail:async()=>deferred})
 const send=async(method,path,{body={},origin='http://127.0.0.1:3031',query={}}={})=>{
  const reply={code:200,payload:null,redirected:'',status(n){this.code=n;return this},json(data){this.payload=data;return this},redirect(_code,url){this.redirected=url;return this}}
  await handlers.get(method+' '+path)({headers:{origin},body,query},reply)
  return reply
 }
 assert.equal((await send('POST','/api/google/start',{body:{service:'gmail'},origin:'https://outside.invalid'})).code,403)
 const start=await send('POST','/api/google/start',{body:{service:'gmail'}})
 assert.equal(start.code,200)
 const state=new URL(start.payload.url).searchParams.get('state')
 assert.ok((await send('GET','/api/google/callback',{query:{state,code:'synthetic-code'}})).redirected.endsWith('google=connected'))
 const running=send('POST','/api/google/gmail/search',{body:{q:'hello'}})
 await Promise.resolve()
 await send('POST','/api/google/disconnect',{body:{service:'gmail'}})
 pendingRelease({readOnly:true,messages:[]})
 assert.equal((await running).code,409)
 assert.equal((await send('POST','/api/google/gmail/search',{body:{q:'hello'}})).code,409)
 assert.ok(![...handlers.keys()].some(key=>/write|update|send|create/i.test(key)))
})
test('Drive read GET accepts browser omission of Origin but still blocks cross-site fetch metadata',async()=>{
 const a=authStub({service:'google-drive',scope:GOOGLE_SCOPES['google-drive']})
 const uri=a.url(),state=uri.searchParams.get('state')
 await a.session.finish({state,code:'oauthcode'})
 const handlers=new Map(),app={get:(p,fn)=>handlers.set('GET '+p,fn),post:(p,fn)=>handlers.set('POST '+p,fn)}
 attachGoogleRoutes(app,new Set(['http://127.0.0.1:3031']),{session:a.session,readDrive:async()=>({readOnly:true,files:[]})})
 const response={code:200,payload:null,status(c){this.code=c;return this},json(v){this.payload=v;return this}}
 await handlers.get('GET /api/google/drive/list')({method:'GET',headers:{},query:{}},response)
 assert.equal(response.code,200)
 const denied={...response,code:200}
 await handlers.get('GET /api/google/drive/list')({method:'GET',headers:{'sec-fetch-site':'cross-site'},query:{}},denied)
 assert.equal(denied.code,403)
})
