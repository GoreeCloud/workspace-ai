import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import {defaultMcpPolicy,normalizeMcpPolicies,trustedMcpClassification,assessMcpTool,MCP_RISK_TIERS} from '../src/mcp-risk-policy.js'
import {newProject,normalizeProject} from '../src/project-model.js'
import {createWorkspaceBackup,parseWorkspaceBackup} from '../src/workspace-backup.js'
import {attachIntegrationRoutes} from '../server/integration-routes.mjs'

function project(provider='remote-desktop-commander'){
 const grant=defaultMcpPolicy()
 grant.read={enabled:true,maxRisk:'low'}
 grant.write={enabled:true,maxRisk:'critical'}
 grant.tools={'devices.list':true,'process.execute':true}
 return {...newProject('p','Build'),mcp:[provider],mcpPolicies:{[provider]:grant}}
}
test('four user-visible risk levels are stable and ordered',()=>{
 assert.deepEqual(MCP_RISK_TIERS,['low','medium','high','critical'])
 assert.deepEqual(defaultMcpPolicy(),{read:{enabled:false,maxRisk:'low'},write:{enabled:false,maxRisk:'low'},tools:{}})
})
test('project MCP tool permissions deny by default and preserve explicit grants in backups',()=>{
 const projectDefault=newProject('p','Private')
 assert.equal(assessMcpTool({project:projectDefault,provider:'remote-desktop-commander',toolName:'devices.list'}).allowed,false)
 const configured=normalizeProject(project())
 assert.equal(configured.mcpPolicies['remote-desktop-commander'].read.enabled,true)
 const workspace={projects:[configured],pinned:[],collapsed:false,expanded:{projects:true,pinned:true,chats:true}}
 const archive=createWorkspaceBackup([],workspace)
 const restored=parseWorkspaceBackup(JSON.stringify(archive))
 assert.deepEqual(restored.workspace.projects[0].mcpPolicies,configured.mcpPolicies)
})
test('unknown tools and malformed settings fail closed',()=>{
 const unknown=trustedMcpClassification('remote-desktop-commander','filesystem.wipe')
 assert.deepEqual(unknown,{mode:'write',risk:'critical',reviewed:false})
 const bad=normalizeMcpPolicies({'remote-desktop-commander':{read:{enabled:true,maxRisk:'banana'},write:{enabled:1,maxRisk:'critical'},tools:{'devices.list':true,'process.execute':'yes'}},evil:{write:{enabled:true}}})
 assert.equal(bad['remote-desktop-commander'].read.maxRisk,'low')
 assert.equal(bad['remote-desktop-commander'].write.enabled,false)
 assert.deepEqual(bad['remote-desktop-commander'].tools,{'devices.list':true})
 assert.equal(bad.evil,undefined)
 assert.equal(assessMcpTool({project:project(),provider:'remote-desktop-commander',toolName:'filesystem.wipe',connected:true,serverAuthorized:true,approved:true,criticalConfirmed:true,executionEnabled:true}).allowed,false)
})
test('read and write are independent, checked against true tool risk',()=>{
 const p=project()
 const base={project:p,provider:'remote-desktop-commander',connected:true,serverAuthorized:true,approved:true,criticalConfirmed:true,executionEnabled:true}
 assert.equal(assessMcpTool({...base,toolName:'devices.list'}).allowed,true)
 assert.equal(assessMcpTool({...base,toolName:'process.execute'}).allowed,true)
 p.mcpPolicies['remote-desktop-commander'].read.enabled=false
 assert.match(assessMcpTool({...base,toolName:'devices.list'}).reason,/read permission disabled/)
 assert.equal(assessMcpTool({...base,toolName:'process.execute'}).allowed,true)
 p.mcpPolicies['remote-desktop-commander'].write.maxRisk='high'
 assert.match(assessMcpTool({...base,toolName:'process.execute'}).reason,/Risk exceeds/)
})
test('write requires separate consent, provider verification, server grant and critical confirmation',()=>{
 const base={project:project(),provider:'remote-desktop-commander',toolName:'process.execute'}
 assert.match(assessMcpTool({...base,connected:true,serverAuthorized:true,approved:true,criticalConfirmed:true}).reason,/execution disabled/)
 assert.match(assessMcpTool({...base,connected:false,executionEnabled:true}).reason,/connection not verified/)
 assert.match(assessMcpTool({...base,connected:true,executionEnabled:true}).reason,/Server-held authorization/)
 assert.match(assessMcpTool({...base,connected:true,executionEnabled:true,serverAuthorized:true}).reason,/Per-operation approval/)
 assert.match(assessMcpTool({...base,connected:true,executionEnabled:true,serverAuthorized:true,approved:true}).reason,/critical confirmation/)
})
test('medium and high risk reads require approvals, not implicit execution',()=>{
 const fire={...newProject('p','Research'),mcp:['firecrawl'],mcpPolicies:{firecrawl:{
  read:{enabled:true,maxRisk:'high'},write:{enabled:false,maxRisk:'low'},tools:{'web.scrape':true,'web.crawl':true}
 }}}
 const b={project:fire,provider:'firecrawl',connected:true,serverAuthorized:true,executionEnabled:true}
 assert.match(assessMcpTool({...b,toolName:'web.scrape'}).reason,/Per-operation approval/)
 assert.equal(assessMcpTool({...b,toolName:'web.scrape',approved:true}).allowed,true)
 assert.equal(assessMcpTool({...b,toolName:'web.crawl',approved:true}).allowed,true)
 assert.equal(assessMcpTool({...b,toolName:'web.crawl',approved:true,criticalConfirmed:true}).risk,'high')
})
test('read-only risk metadata endpoint uses reviewed classifications and never enables execution',async()=>{
 const app=express()
 attachIntegrationRoutes(app,new Set(['http://127.0.0.1:3031']))
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))})
 try{
  const base='http://127.0.0.1:'+server.address().port
  const result=await fetch(base+'/api/integrations/remote-desktop-commander/risk-policy')
  assert.equal(result.status,200)
  const data=await result.json()
  assert.equal(data.executionEnabled,false)
  assert.deepEqual(data.riskTiers,MCP_RISK_TIERS)
  assert.equal(data.tools.find(t=>t.name==='process.execute').risk,'critical')
  assert.equal(data.tools.find(t=>t.name==='devices.list').mode,'read')
  assert.equal((await fetch(base+'/api/integrations/tinyfish/risk-policy')).status,404)
  assert.equal((await fetch(base+'/api/integrations/github/risk-policy')).status,404)
 }finally{await new Promise(resolve=>server.close(resolve))}
})

test('MCP server-supplied annotations cannot downgrade trusted risk',async()=>{
 const app=express();app.use(express.json())
 attachIntegrationRoutes(app,new Set(['http://127.0.0.1:3031']),{
  discover:async()=>({status:'connected',message:'synthetic test',tools:[
   {name:'process.execute',mode:'read',risk:'low',reviewed:true},
   {name:'unreviewed.action',mode:'read',risk:'low',reviewed:true}
  ]})
 })
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))})
 try{
  const url='http://127.0.0.1:'+server.address().port+'/api/integrations/remote-desktop-commander/discover'
  const reply=await fetch(url,{method:'POST',headers:{Origin:'http://127.0.0.1:3031','Content-Type':'application/json'},body:'{}'})
  assert.equal(reply.status,200)
  const {tools,executionEnabled}=await reply.json()
  assert.equal(executionEnabled,false)
  assert.deepEqual({mode:tools[0].mode,risk:tools[0].risk,reviewed:tools[0].reviewed},{mode:'write',risk:'critical',reviewed:true})
  assert.deepEqual({mode:tools[1].mode,risk:tools[1].risk,reviewed:tools[1].reviewed},{mode:'write',risk:'critical',reviewed:false})
 }finally{await new Promise(resolve=>server.close(resolve))}
})
