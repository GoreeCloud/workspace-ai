import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import {setTimeout as sleep} from 'node:timers/promises'
import {attachIntegrationRoutes} from '../server/integration-routes.mjs'

test('integration endpoints are local-origin gated, secret-free and ignore stale results',async()=>{
 const app=express();app.use(express.json())
 attachIntegrationRoutes(app,new Set(['http://127.0.0.1:3031']))
 const listener=await new Promise(resolve=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server))})
 const base='http://127.0.0.1:'+listener.address().port
 const actualFetch=globalThis.fetch
 const pending=[]
 globalThis.fetch=async(url,options)=>{
  if(String(url)==='https://api.github.com/user'){
   assert.equal(options.redirect,'error')
   assert.equal(options.method,'GET')
   return new Promise(resolve=>pending.push(resolve))
  }
  return actualFetch(url,options)
 }
 const headers={Origin:'http://127.0.0.1:3031','Content-Type':'application/json'}
 const post=(suffix,body={},extra=headers)=>actualFetch(base+'/api/integrations/'+suffix,{
  method:'POST',headers:extra,body:JSON.stringify(body)
 })
 const settle=()=>pending.shift()({ok:true,status:200,json:async()=>({login:'GoreeCloud'})})
 const wait=async()=>{for(let i=0;i<60&&!pending.length;i++)await sleep(20);assert.ok(pending.length,'provider verification never started')}
 try{
  const services=await (await actualFetch(base+'/api/integrations')).json()
  assert.equal(services.services.length,9)
  assert.equal(services.executionEnabled,false)
  assert.ok(services.services.every(s=>s.tools.every(t=>t.executable===false)))
  const outsider=await post('github/connect',{token:'synthetic-token-for-testing'},{Origin:'https://attacker.example','Content-Type':'application/json'})
  assert.equal(outsider.status,403)
  const token='synthetic-goreecloud-session-credential'
  const connecting=post('github/connect',{token})
  await wait();settle()
  const accepted=await connecting
  assert.equal(accepted.status,200)
  assert.equal((await accepted.json()).connected,true)
  const catalog=await (await actualFetch(base+'/api/integrations')).text()
  assert.ok(!catalog.includes(token),'Token leaked through service catalog')
  const verifying=post('github/verify')
  await wait()
  const disconnected=await post('github/disconnect')
  assert.equal(disconnected.status,200)
  settle()
  assert.equal((await verifying).status,409,'Stale verification may not restore a disconnected service')
  assert.equal((await (await actualFetch(base+'/api/integrations')).json()).services.find(s=>s.id==='github').connected,false)
  const pendingConnect=post('github/connect',{token})
  await wait()
  await post('github/disconnect')
  settle()
  assert.equal((await pendingConnect).status,409,'Stale initial connect may not restore a disconnected service')
  assert.equal((await post('github/invoke',{tool:'repos.write'})).status,404)
 }finally{
  globalThis.fetch=actualFetch
  await new Promise(resolve=>listener.close(resolve))
 }
})
