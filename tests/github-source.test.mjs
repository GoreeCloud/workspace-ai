import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import {validateGitHubSource,readGitHubSource,GitHubSourceError} from '../server/github-source.mjs'
import {attachGitHubSourceRoute} from '../server/github-source-routes.mjs'

const sha='a'.repeat(40)
const token='synthetic-authenticated-token'
const request={repo:'workspace-ai',path:'src/App.jsx'}
const body=(content='export default 42',extra={})=>({
 type:'file',encoding:'base64',content:Buffer.from(content,'utf8').toString('base64'),size:Buffer.byteLength(content),sha,...extra
})
const ok=record=>({ok:true,status:200,headers:{get:()=>null},text:async()=>JSON.stringify(record)})
test('source path validation rejects traversals, user namespace selection, binary and credentials',()=>{
 assert.deepEqual(validateGitHubSource(request).requestPath,'src/App.jsx')
 for(const path of ['../secrets.md','src/../App.jsx','/etc/password.txt','src/','src\\file.md','src/./index.js','.env','.env.local','secret.key','photo.png','x'.repeat(230)+'a.md']){
  assert.throws(()=>validateGitHubSource({repo:'workspace-ai',path}),GitHubSourceError,path)
 }
 for(const repo of ['Other/name','..','.','repo?x=1'])assert.throws(()=>validateGitHubSource({repo,path:'README.md'}),GitHubSourceError)
})
test('GitHub read only uses fixed owner Contents API and includes no credentials in results',async()=>{
 let calls=0
 const result=await readGitHubSource(token,request,async(url,options)=>{
  calls++
  assert.equal(url,'https://api.github.com/repos/GoreeCloud/workspace-ai/contents/src/App.jsx')
  assert.equal(options.method,'GET')
  assert.equal(options.redirect,'error')
  assert.equal(options.headers.Authorization,'Bearer '+token)
  return ok(body('export default 42'))
 })
 assert.equal(calls,1)
 assert.equal(result.content,'export default 42')
 assert.equal(result.readOnly,true)
 assert.equal(result.sha,sha)
 assert.ok(!JSON.stringify(result).includes(token))
})
test('GitHub source read fails closed for binary, invalid UTF8, oversized, malformed and directory responses',async()=>{
 for(const record of [
  {...body('hello'),type:'dir'},
  {...body('hello'),size:65537},
  {...body('hello'),content:'%%%'},
  {...body('hello'),content:Buffer.from([0xff]).toString('base64'),size:1},
  {...body('hello'),content:Buffer.from([0]).toString('base64'),size:1},
  {...body('hello'),sha:'invalid'},
  [body('hello')]
 ]){
  await assert.rejects(()=>readGitHubSource(token,request,async()=>ok(record)),GitHubSourceError)
 }
 await assert.rejects(()=>readGitHubSource(token,request,async()=>({
  ok:true,status:200,headers:{get:()=> '9999999'},text:async()=>{throw Error('should not consume oversized')}
 })),/oversized/)
})
test('GitHub source errors do not leak token or provider details',async()=>{
 for(const code of [401,403,404,500]){
  await assert.rejects(()=>readGitHubSource(token,request,async()=>({ok:false,status:code})),e=>{
   assert.ok(e instanceof GitHubSourceError)
   assert.ok(!e.message.includes(token))
   return true
  })
 }
 await assert.rejects(()=>readGitHubSource(token,request,async()=>{throw Error('private-token='+token)}),e=>!e.message.includes(token))
})
test('session-scoped HTTP route checks origin, revoked connections and server revision',async()=>{
 let revision=1,credential=token,invalidations=0
 let resume,resolveStarted
 const pending=new Promise(resolve=>{resume=resolve})
 const started=new Promise(resolve=>{resolveStarted=resolve})
 const app=express()
 attachGitHubSourceRoute(app,{origins:new Set(['http://127.0.0.1:3031']),getToken:()=>credential,
  getRevision:()=>revision,invalidate:()=>{invalidations++;credential=null;revision++}},
  async()=>{resolveStarted();return pending})
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))})
 const base='http://127.0.0.1:'+server.address().port+'/api/integrations/github/source?repo=workspace-ai&path=README.md'
 try{
  assert.equal((await fetch(base,{headers:{Origin:'https://outside.example'}})).status,403)
  const inFlight=fetch(base,{headers:{Origin:'http://127.0.0.1:3031'}})
  await started
  revision++
  resume({...request,readOnly:true,sha,content:'old state'})
  assert.equal((await inFlight).status,409)
  const x=await fetch(base,{headers:{Origin:'http://127.0.0.1:3031'}})
  assert.equal(x.status,200)
  assert.equal(invalidations,0)
 }finally{await new Promise(resolve=>server.close(resolve))}
})
test('GitHub 401 invalidates server token and blocks further reads',async()=>{
 let credential=token,revision=0,calls=0
 const app=express()
 attachGitHubSourceRoute(app,{origins:new Set(['http://127.0.0.1:3031']),getToken:()=>credential,getRevision:()=>revision,
  invalidate:()=>{credential=null;revision++}},async()=>{calls++;throw new GitHubSourceError(401,'Credential rejected.')})
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))})
 const uri='http://127.0.0.1:'+server.address().port+'/api/integrations/github/source?repo=workspace-ai&path=README.md'
 try{
  assert.equal((await fetch(uri)).status,401)
  assert.equal((await fetch(uri)).status,409)
  assert.equal(calls,1)
 }finally{await new Promise(resolve=>server.close(resolve))}
})
