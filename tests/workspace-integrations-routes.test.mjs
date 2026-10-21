import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { attachIntegrationRoutes } from '../server/integration-routes.mjs'

test('integration routes protect origins, session secrets, health checks and MCP discovery', async () => {
 const app=express()
 app.use(express.json())
 let outcome='connected'
 const passedTokens=[]
 attachIntegrationRoutes(app,new Set(['http://127.0.0.1:3032']),{
  checkToken:async(id,token)=>{passedTokens.push({id,token});return {status:outcome,message:'Synthetic provider result'}},
  discover:async id=>({status:'connected',message:'Synthetic MCP',tools:[{name:'readfile',description:'Read file',executable:true,requiresApproval:false}]})
 })
 const server=await new Promise(resolve=>{
  const listener=app.listen(0,'127.0.0.1',()=>resolve(listener))
 })
 const base='http://127.0.0.1:'+server.address().port+'/api/integrations'
 const authorized={Origin:'http://127.0.0.1:3032','Content-Type':'application/json'}
 const token='synthetic-secret-do-not-echo-123456'
 const req=async(path,method='GET',body,headers=authorized)=>{
  const response=await fetch(base+path,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})})
  return {status:response.status,body:await response.json()}
 }
 try {
  const initial=await req('')
  assert.equal(initial.status,200)
  assert.equal(initial.body.services.length,16)
  assert.ok(initial.body.services.every(s=>s.connected===false&&s.hasSessionToken===false))
  assert.ok(initial.body.services.every(s=>s.tools.every(t=>t.executable===false)))
  assert.equal((await req('/todoist/connect','POST',{token},{Origin:'https://malicious.example','Content-Type':'application/json'})).status,403)
  assert.equal((await req('/does-not-exist/connect','POST',{token})).status,404)
  const connected=await req('/todoist/connect','POST',{token})
  assert.equal(connected.status,200)
  assert.equal(connected.body.connected,true)
  assert.ok(!JSON.stringify(connected.body).includes(token))
  let listing=await req('')
  assert.equal(listing.body.services.find(s=>s.id==='todoist').hasSessionToken,true)
  assert.equal(passedTokens[0].token,token)
  outcome='unavailable'
  const offline=await req('/todoist/verify','POST',{})
  assert.equal(offline.body.connected,false)
  listing=await req('')
  assert.equal(listing.body.services.find(s=>s.id==='todoist').hasSessionToken,true)
  outcome='connected'
  assert.equal((await req('/todoist/verify','POST',{})).body.connected,true)
  outcome='invalid'
  assert.equal((await req('/todoist/verify','POST',{})).body.status,'invalid')
  assert.equal((await req('/todoist/verify','POST',{})).status,409)
  listing=await req('')
  assert.equal(listing.body.services.find(s=>s.id==='todoist').hasSessionToken,false)
  const discovered=await req('/firecrawl/discover','POST',{})
  assert.equal(discovered.status,200)
  assert.equal(discovered.body.tools[0].executable,false)
  assert.equal(discovered.body.tools[0].requiresApproval,true)
  listing=await req('')
  assert.equal(listing.body.services.find(s=>s.id==='firecrawl').connected,true)
  assert.equal((await req('/firecrawl/disconnect','POST',{})).body.connected,false)
  assert.equal((await req('/gmail/connect','POST',{token})).status,409)
  assert.equal((await req('/todoist/verify','POST',{}, {Origin:'https://evil.example'})).status,403)
 }finally{
  await new Promise(resolve=>server.close(resolve))
 }
})
