import test from 'node:test'
import assert from 'node:assert/strict'
import {readDropboxFolder,DropboxReadError} from '../server/dropbox-reader.mjs'
import {attachDropboxReadRoute} from '../server/dropbox-routes.mjs'
import {readFile} from 'node:fs/promises'

const key='synthetic-dropbox-token'
const ok=body=>({ok:true,status:200,json:async()=>body})

test('Dropbox root folder uses bounded read-only metadata endpoint',async()=>{
 const result=await readDropboxFolder(key,{},async(url,options)=>{
  assert.equal(url,'https://api.dropboxapi.com/2/files/list_folder')
  assert.equal(options.method,'POST')
  assert.equal(options.redirect,'error')
  assert.equal(options.headers.Authorization,'Bearer '+key)
  assert.deepEqual(JSON.parse(options.body),{path:'',recursive:false,include_deleted:false,limit:50})
  return ok({entries:[
   {'.tag':'folder',name:'GoreeCloud',path_display:'/GoreeCloud',secret:'DO_NOT_ECHO'},
   {'.tag':'file',name:'README.md',path_display:'/README.md',size:1024,server_modified:'2026-10-19T00:00:00Z',download:'secret'},
   {'.tag':'deleted',name:'old',path_display:'/old'}
  ],has_more:true,cursor:'next-page'})
 })
 assert.deepEqual(result.entries,[
  {type:'folder',name:'GoreeCloud',path:'/GoreeCloud',size:null,modified:''},
  {type:'file',name:'README.md',path:'/README.md',size:1024,modified:'2026-10-19T00:00:00Z'}
 ])
 assert.equal(result.nextCursor,'next-page')
 assert.ok(!JSON.stringify(result).includes('DO_NOT_ECHO'))
 assert.ok(!JSON.stringify(result).includes(key))
})

test('Dropbox continuation uses only its fixed /continue endpoint',async()=>{
 const result=await readDropboxFolder(key,{path:'/Folder',cursor:'next-page'},async(url,options)=>{
  assert.equal(url,'https://api.dropboxapi.com/2/files/list_folder/continue')
  assert.deepEqual(JSON.parse(options.body),{cursor:'next-page'})
  return ok({entries:[],has_more:false,cursor:'future'})
 })
 assert.equal(result.nextCursor,null)
 assert.equal(result.readOnly,true)
})

test('Dropbox blocks malformed inputs and handles rejected tokens',async()=>{
 const bad=opts=>assert.rejects(readDropboxFolder(key,opts,async()=>{throw Error('No network expected')}),error=>error instanceof DropboxReadError&&error.status===400)
 await bad({path:'../../etc/passwd'})
 await bad({path:'/Folder/../private'})
 await bad({path:'/with\ncontrol'})
 await bad({cursor:'with\ncontrol'})
 await bad({cursor:'x'.repeat(2049)})
 await assert.rejects(readDropboxFolder(key,{},async()=>({ok:false,status:401})),error=>error.status===401)
 await assert.rejects(readDropboxFolder(key,{},async()=>({ok:false,status:429})),error=>error.status===503)
 await assert.rejects(readDropboxFolder(key,{},async()=>ok({unexpected:1})),error=>error.status===502)
})

test('Dropbox local route rejects foreign origins and stale disconnects',async()=>{
 let handler
 let token=null,revision=0,revoked=false,finish
 const app={get(path,fn){assert.equal(path,'/api/integrations/dropbox/data');handler=fn},post(path,fn){assert.equal(path,'/api/integrations/dropbox/import-text');assert.equal(typeof fn,'function')}}
 let reader=()=>new Promise(resolve=>{finish=resolve})
 const config={origins:new Set(['http://127.0.0.1:3031']),getToken:()=>token,getRevision:()=>revision,invalidate:()=>{revoked=true;token=null;revision++}}
 attachDropboxReadRoute(app,config,(...args)=>reader(...args))
 const invoke=async (headers={origin:'http://127.0.0.1:3031'},query={})=>{
  const res={code:200,body:null,status(n){this.code=n;return this},json(body){this.body=body;return this}}
  await handler({headers,query},res);return res
 }
 assert.equal((await invoke()).code,409)
 token=key
 assert.equal((await invoke({origin:'https://attacker.invalid'})).code,403)
 assert.equal((await invoke({'sec-fetch-site':'cross-site'})).code,403)
 const pending=invoke()
 await new Promise(resolve=>setImmediate(resolve))
 revision++
 finish({path:'',entries:[{name:'stale'}],nextCursor:null})
 assert.equal((await pending).code,409)
 reader=()=>{throw new DropboxReadError(401,'Rejected')}
 const failed=await invoke()
 assert.equal(failed.code,401)
 assert.equal(revoked,true)
 assert.equal(token,null)
})

test('Dropbox UI does not embed browser credentials or mutate files',async()=>{
 const jsx=await readFile(new URL('../src/DropboxBrowser.jsx',import.meta.url),'utf8')
 assert.match(jsx,/Read-only Dropbox folder browser/)
 assert.match(jsx,/Load more/)
 assert.doesNotMatch(jsx,/localStorage|sessionStorage|Authorization|upload|delete|shareFile/)
})
