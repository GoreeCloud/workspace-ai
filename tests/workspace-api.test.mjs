import test from 'node:test'
import assert from 'node:assert/strict'
import {workspaceJson} from '../src/workspace-api.js'

const json=(body,status=200)=>new Response(JSON.stringify(body),{
 status,headers:{'content-type':'application/json; charset=utf-8'}
})
test('Workspace API GET stays same-origin, no-store and returns validated JSON',async()=>{
 let calls=0
 const body=await workspaceJson('/api/status',{fetchImpl:async(url,options)=>{
  calls++;assert.equal(url,'/api/status')
  assert.equal(options.method,'GET');assert.equal(options.credentials,'same-origin')
  assert.equal(options.cache,'no-store');assert.equal(options.body,undefined)
  return json({connected:true})
 }})
 assert.deepEqual(body,{connected:true});assert.equal(calls,1)
})
test('Workspace API POST forwards expected scoped headers without silent retries',async()=>{
 let calls=0
 const out=await workspaceJson('/api/auth/switch',{data:{accountId:'id'},
  headers:{'x-workspace-account-id':'local-account'},fetchImpl:async(url,options)=>{
   calls++;assert.equal(options.method,'POST')
   assert.equal(options.headers['content-type'],'application/json')
   assert.equal(options.headers['x-workspace-account-id'],'local-account')
   assert.deepEqual(JSON.parse(options.body),{accountId:'id'})
   return json({ok:true})
  }})
 assert.deepEqual(out,{ok:true});assert.equal(calls,1)
})
test('Workspace API reports backend errors once and bounds untrusted error strings',async()=>{
 let calls=0
 await assert.rejects(workspaceJson('/api/models',{fetchImpl:async()=>{calls++;return json({error:'Bad account'},403)}}),/Bad account/)
 assert.equal(calls,1)
 await assert.rejects(workspaceJson('/api/status',{fetchImpl:async()=>json({error:'x'.repeat(1000)},500)}),
  error=>error.message.length<=300)
})
test('Workspace API reports non-JSON and malformed success payloads with actionable errors',async()=>{
 await assert.rejects(workspaceJson('/api/status',{fetchImpl:async()=>new Response('<html>Gateway</html>',{
  status:502,headers:{'content-type':'text/html'}})}),/non-JSON/)
 await assert.rejects(workspaceJson('/api/status',{fetchImpl:async()=>new Response('{broken',{
  status:200,headers:{'content-type':'application/json'}})}),/invalid JSON/)
 await assert.rejects(workspaceJson('/api/status',{fetchImpl:async()=>json(['unexpected'])}),/unexpected response/)
})
test('Workspace API reports offline errors without exposing fetch internals',async()=>{
 await assert.rejects(workspaceJson('/api/status',{fetchImpl:async()=>{throw new TypeError('fetch failed')}}),
  /Unable to reach the Workspace AI service/)
})
test('Workspace API aborts timed-out operations without automatically submitting another request',async()=>{
 let calls=0
 await assert.rejects(workspaceJson('/api/status',{timeoutMs:15,fetchImpl:async(_url,options)=>{
  calls++
  return new Promise((_resolve,reject)=>{
   options.signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true})
  })
 }}),/timed out/)
 assert.equal(calls,1)
})
test('Workspace API refuses arbitrary destinations and unreasonable timeouts',async()=>{
 await assert.rejects(workspaceJson('https://elsewhere.example/secret'),/local/)
 await assert.rejects(workspaceJson('//elsewhere.example/api/status'),/local/)
 await assert.rejects(workspaceJson('/api/status',{timeoutMs:181000}),/timeout/)
})
