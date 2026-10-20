import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import {createMcpApprovalBroker} from '../server/mcp-approval-broker.mjs'
import {attachMcpApprovalRoutes} from '../server/mcp-approval-routes.mjs'
import {attachIntegrationRoutes} from '../server/integration-routes.mjs'

const ownerKey='local-owner-testing-key-that-is-32-chars-or-longer'
function project(){
 return {mcp:['remote-desktop-commander','firecrawl'],mcpPolicies:{
  'remote-desktop-commander':{
   read:{enabled:true,maxRisk:'low'},write:{enabled:true,maxRisk:'critical'},
   tools:{'devices.list':true,'process.execute':true}
  },
  firecrawl:{
   read:{enabled:true,maxRisk:'high'},write:{enabled:false,maxRisk:'low'},
   tools:{'web.scrape':true,'web.crawl':true}
  }
 }}
}
test('owner secret is opt-in, checked and never included in audit',()=>{
 const disabled=createMcpApprovalBroker()
 assert.equal(disabled.configured,false)
 assert.throws(()=>disabled.authenticate('Bearer '+ownerKey),/not configured/)
 const b=createMcpApprovalBroker({ownerSecret:ownerKey})
 assert.equal(b.configured,true)
 assert.throws(()=>b.authenticate('Bearer incorrect-owner-password-long-enough'),/Owner authorization required/)
 assert.doesNotThrow(()=>b.authenticate('Bearer '+ownerKey))
 b.savePolicy('p1',project())
 assert.ok(!JSON.stringify(b.history()).includes(ownerKey))
})
test('risk and exact input digest are checked; critical approval is separate and single use',()=>{
 let now=1000
 const broker=createMcpApprovalBroker({ownerSecret:ownerKey,now:()=>now})
 broker.savePolicy('p1',project())
 const stage=broker.stage({projectId:'p1',provider:'remote-desktop-commander',toolName:'process.execute',args:{command:'echo synthetic only'}})
 assert.equal(stage.risk,'critical')
 assert.equal(stage.executionEnabled,false)
 assert.equal(stage.criticalConfirmationRequired,true)
 assert.throws(()=>broker.approve({id:stage.id,digest:stage.digest}),/explicit approval/)
 assert.throws(()=>broker.approve({id:stage.id,digest:stage.digest,confirmation:'APPROVE'}),/critical confirmation/)
 assert.throws(()=>broker.approve({id:stage.id,digest:'0'.repeat(64),confirmation:'APPROVE',criticalConfirmation:'CONFIRM CRITICAL'}),/mismatched/)
 broker.approve({id:stage.id,digest:stage.digest,confirmation:'APPROVE',criticalConfirmation:'CONFIRM CRITICAL'})
 const preview=broker.consume({id:stage.id,digest:stage.digest})
 assert.deepEqual({policyValidated:preview.policyValidated,executed:preview.executed},{policyValidated:true,executed:false})
 assert.throws(()=>broker.consume({id:stage.id,digest:stage.digest}),/Unknown, expired/)
 const text=JSON.stringify(broker.history())
 assert.ok(!text.includes('echo synthetic only'))
 assert.ok(!text.includes(ownerKey))
})
test('medium and high require consent while low allowlisted metadata can be staged',()=>{
 const b=createMcpApprovalBroker({ownerSecret:ownerKey})
 b.savePolicy('p1',project())
 const low=b.stage({projectId:'p1',provider:'remote-desktop-commander',toolName:'devices.list',args:{}})
 assert.equal(low.approvalRequired,false)
 assert.equal(b.consume({id:low.id,digest:low.digest}).executed,false)
 for(const name of ['web.scrape','web.crawl']){
  const req=b.stage({projectId:'p1',provider:'firecrawl',toolName:name,args:{url:'https://example.com'}})
  assert.throws(()=>b.consume({id:req.id,digest:req.digest}),/not been approved/)
  b.approve({id:req.id,digest:req.digest,confirmation:'APPROVE'})
  assert.equal(b.consume({id:req.id,digest:req.digest}).executed,false)
 }
})
test('expiry, policy replacement, project revocation and provider disconnection invalidate pending grants',()=>{
 let clock=0
 const b=createMcpApprovalBroker({ownerSecret:ownerKey,now:()=>clock,ttlMs:500})
 b.savePolicy('p1',project())
 const exp=b.stage({projectId:'p1',provider:'firecrawl',toolName:'web.scrape',args:{url:'https://example.com'}})
 clock=501
 assert.throws(()=>b.approve({id:exp.id,digest:exp.digest,confirmation:'APPROVE'}),/Unknown, expired/)
 const replaced=b.stage({projectId:'p1',provider:'firecrawl',toolName:'web.scrape',args:{}})
 b.savePolicy('p1',project())
 assert.throws(()=>b.approve({id:replaced.id,digest:replaced.digest,confirmation:'APPROVE'}),/Unknown, expired/)
 const detached=b.stage({projectId:'p1',provider:'firecrawl',toolName:'web.scrape',args:{}})
 b.revokeProvider('firecrawl')
 assert.throws(()=>b.consume({id:detached.id,digest:detached.digest}),/Unknown, expired/)
 assert.throws(()=>b.stage({projectId:'p1',provider:'firecrawl',toolName:'web.scrape',args:{}}),/Risk policy denied/)
 b.savePolicy('p1',project())
 const deleted=b.stage({projectId:'p1',provider:'firecrawl',toolName:'web.scrape',args:{}})
 b.revokeProject('p1')
 assert.throws(()=>b.approve({id:deleted.id,digest:deleted.digest,confirmation:'APPROVE'}),/Unknown, expired/)
})
test('unregistered projects, unreviewed tools, oversized payloads and invalid policy never pass preflight',()=>{
 const b=createMcpApprovalBroker({ownerSecret:ownerKey})
 assert.throws(()=>b.stage({projectId:'p1',provider:'firecrawl',toolName:'web.scrape',args:{}}),/server-side/)
 assert.throws(()=>b.savePolicy('bad/id',project()),/Invalid server policy/)
 assert.throws(()=>b.savePolicy('p1',{mcp:['unknown'],mcpPolicies:{}}),/Unknown or duplicate/)
 b.savePolicy('p1',project())
 assert.throws(()=>b.stage({projectId:'p1',provider:'remote-desktop-commander',toolName:'delete.all',args:{}}),/Risk policy denied/)
 assert.throws(()=>b.stage({projectId:'p1',provider:'firecrawl',toolName:'web.scrape',args:{text:'x'.repeat(9000)}}),/8 KB/)
 assert.throws(()=>b.stage({projectId:'p1',provider:'firecrawl',toolName:'web.scrape',args:'not an object'}),/JSON object/)
})
test('HTTP endpoints reject origins, missing owner secrets, replays and never invoke MCP adapters',async()=>{
 const app=express()
 app.use(express.json())
 const origins=new Set(['http://127.0.0.1:3031'])
 const broker=attachMcpApprovalRoutes(app,origins,{ownerSecret:ownerKey})
 const listener=await new Promise(resolve=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server))})
 const base='http://127.0.0.1:'+listener.address().port
 const body=(path,payload,origin='http://127.0.0.1:3031',secret=ownerKey)=>fetch(base+path,{
  method:'POST',headers:{Origin:origin,Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify(payload)
 })
 try{
  assert.equal((await (await fetch(base+'/api/mcp-approval/status')).json()).executionEnabled,false)
  assert.equal((await body('/api/mcp-approval/projects/p1',project(),'https://attacker.example')).status,403)
  assert.equal((await body('/api/mcp-approval/projects/p1',project(),'http://127.0.0.1:3031','wrong')).status,401)
  assert.equal((await body('/api/mcp-approval/projects/p1',project())).status,200)
  const proposal=await (await body('/api/mcp-approval/stage',{projectId:'p1',provider:'firecrawl',toolName:'web.scrape',args:{query:'test'}})).json()
  assert.equal(proposal.risk,'medium')
  assert.equal((await body('/api/mcp-approval/consume-dry-run',proposal)).status,400)
  assert.equal((await body('/api/mcp-approval/approve',{...proposal,confirmation:'APPROVE'})).status,200)
  const done=await (await body('/api/mcp-approval/consume-dry-run',proposal)).json()
  assert.equal(done.executed,false)
  assert.equal((await body('/api/mcp-approval/consume-dry-run',proposal)).status,400)
  const logs=await (await fetch(base+'/api/mcp-approval/audit',{headers:{Origin:'http://127.0.0.1:3031',Authorization:'Bearer '+ownerKey}})).json()
  assert.ok(logs.events.some(item=>item.event==='dry-run-consumed'))
  assert.equal(logs.executionEnabled,false)
  assert.ok(!JSON.stringify(logs).includes('test'))
  const noAccess=await fetch(base+'/api/mcp-approval/audit')
  assert.equal(noAccess.status,403)
  assert.equal(broker.status().executionEnabled,false)
 }finally{await new Promise(resolve=>listener.close(resolve))}
})
test('rediscover and disconnect trigger server revoke callback without executing tools',async()=>{
 const app=express();app.use(express.json())
 const origins=new Set(['http://127.0.0.1:3031'])
 const broker=attachMcpApprovalRoutes(app,origins,{ownerSecret:ownerKey})
 attachIntegrationRoutes(app,origins,{onMcpChange:provider=>broker.revokeProvider(provider),
  discover:async()=>({status:'connected',message:'synthetic',tools:[{name:'web.scrape',description:'synthetic'}]})})
 const listener=await new Promise(resolve=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server))})
 const base='http://127.0.0.1:'+listener.address().port
 try{
  broker.savePolicy('p1',project())
  const staged=broker.stage({projectId:'p1',provider:'firecrawl',toolName:'web.scrape',args:{}})
  const headers={Origin:'http://127.0.0.1:3031','Content-Type':'application/json'}
  const discovered=await fetch(base+'/api/integrations/firecrawl/discover',{method:'POST',headers,body:'{}'})
  assert.equal(discovered.status,200)
  assert.throws(()=>broker.consume({id:staged.id,digest:staged.digest}),/Unknown, expired/)
  assert.throws(()=>broker.stage({projectId:'p1',provider:'firecrawl',toolName:'web.scrape',args:{}}),/Risk policy denied/)
  const disconnected=await fetch(base+'/api/integrations/firecrawl/disconnect',{method:'POST',headers,body:'{}'})
  assert.equal(disconnected.status,200)
 }finally{await new Promise(resolve=>listener.close(resolve))}
})
