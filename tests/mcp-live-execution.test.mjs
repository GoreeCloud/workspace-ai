import test from 'node:test'
import assert from 'node:assert/strict'
import {publicIPv4,validateMcpEndpoint,validateApprovedMcpArguments} from '../server/mcp-executor.mjs'
test('read and write adapters fail closed',()=>{
 assert.equal(publicIPv4('127.0.0.1'),false)
 assert.equal(publicIPv4('8.8.8.8'),true)
 assert.throws(()=>validateMcpEndpoint('http://127.0.0.1/mcp'))
 assert.throws(()=>validateApprovedMcpArguments('remote-desktop-commander','process.execute',{command:'not-allowed'}))
})
test('external arguments cannot bypass reviewed validation',()=>{
 assert.throws(()=>validateApprovedMcpArguments('firecrawl','web.scrape',{url:'https://external.example'},{allowHosts:['example.com']}))
 assert.throws(()=>validateApprovedMcpArguments('firecrawl','web.scrape',{url:'https://example.com',headers:{Authorization:'secret'}},{allowHosts:['example.com']}))
})

import {invokeReviewedMcp} from '../server/mcp-executor.mjs'
test('reviewed adapter initializes and verifies tool before a call',async()=>{
 const seen=[]
 const rpc=async (_url,payload)=>{
  seen.push(payload.method)
  if(payload.method==='notifications/initialized')return {text:''}
  const result=payload.method==='initialize'?{capabilities:{tools:{}}}:payload.method==='tools/list'?{tools:[{name:'web.scrape'}]}:{content:[{type:'text',text:'synthetic'}]}
  return {text:JSON.stringify({jsonrpc:'2.0',id:payload.id,result})}
 }
 const result=await invokeReviewedMcp({provider:'firecrawl',toolName:'web.scrape',args:{url:'https://example.com'},endpoint:'https://mcp.example.com/mcp',allowHosts:['example.com'],rpc})
 assert.equal(result.content[0].text,'synthetic')
 assert.deepEqual(seen,['initialize','notifications/initialized','tools/list','tools/call'])
 await assert.rejects(()=>invokeReviewedMcp({provider:'firecrawl',toolName:'web.scrape',args:{url:'https://example.com'},endpoint:'https://mcp.example.com/mcp',allowHosts:['example.com'],rpc,preCall:()=>{throw Error('revoked')}}),/revoked/)
})

import {attachMcpLiveRoutes} from '../server/mcp-live-routes.mjs'
import {createMcpApprovalBroker} from '../server/mcp-approval-broker.mjs'
function liveFixture(){
 const ownerKey='synthetic-dedicated-owner-test-key-longer-than-32'
 const broker=createMcpApprovalBroker({ownerSecret:ownerKey})
 broker.savePolicy('project1',{mcp:['firecrawl'],mcpPolicies:{firecrawl:{read:{enabled:true,maxRisk:'medium'},write:{enabled:false,maxRisk:'low'},tools:{'web.scrape':true}}}})
 const proposal=broker.stage({projectId:'project1',provider:'firecrawl',toolName:'web.scrape',args:{url:'https://example.com'}})
 broker.approve({id:proposal.id,digest:proposal.digest,confirmation:'APPROVE'})
 const routes=new Map()
 const app={get:(key,fn)=>routes.set('GET '+key,fn),post:(key,fn)=>routes.set('POST '+key,fn)}
 const invoke=async(payload,headers={origin:'http://127.0.0.1:3031',authorization:'Bearer '+ownerKey})=>{
  const res={code:200,body:null,status(code){this.code=code;return this},json(body){this.body=body;return this}}
  await routes.get('POST /api/mcp-live/execute')({headers,body:payload},res)
  return res
 }
 return {ownerKey,broker,proposal,app,invoke}
}
test('execution stays disabled until explicitly switched on',async()=>{
 const {broker,proposal,app,invoke}=liveFixture()
 attachMcpLiveRoutes(app,new Set(['http://127.0.0.1:3031']),{broker,enabled:false,providerReady:()=>true})
 assert.equal((await invoke({id:proposal.id,digest:proposal.digest})).code,409)
})

test('live action requires origin, owner, current provider and one-time claim',async()=>{
 const {broker,proposal,app,invoke}=liveFixture()
 let calls=0
 attachMcpLiveRoutes(app,new Set(['http://127.0.0.1:3031']),{broker,enabled:true,providerReady:()=>true,allowHosts:()=>['example.com'],endpointFor:()=> 'https://mcp.example.com/mcp',invoke:async({preCall})=>{await preCall();calls++;return {content:[]}}})
 const args={id:proposal.id,digest:proposal.digest}
 assert.equal((await invoke(args,{origin:'https://other.example',authorization:'Bearer wrong'})).code,403)
 assert.equal((await invoke(args,{origin:'http://127.0.0.1:3031',authorization:'Bearer wrong'})).code,401)
 assert.equal((await invoke(args)).code,200)
 assert.equal((await invoke(args)).code,409)
 assert.equal(calls,1)
})
test('provider revocation immediately before a tool call prevents execution',async()=>{
 const {broker,proposal,app,invoke}=liveFixture()
 let calls=0
 attachMcpLiveRoutes(app,new Set(['http://127.0.0.1:3031']),{broker,enabled:true,providerReady:()=>true,allowHosts:()=>['example.com'],invoke:async({preCall})=>{broker.revokeProvider('firecrawl');await preCall();calls++;return {content:[]}}})
 const result=await invoke({id:proposal.id,digest:proposal.digest})
 assert.equal(result.code,502)
 assert.equal(calls,0)
 assert.equal(result.body.executed,false)
})

test('write-classified tools need independent live write enablement',async()=>{
 const {app,invoke}=liveFixture()
 let calls=0
 const broker={
  configured:true,authenticate(){},
  peekLive:()=>({provider:'remote-desktop-commander',toolName:'process.execute',mode:'write',risk:'critical',args:{command:'date'}}),
  claimLive:()=>{calls++;throw Error('Should not claim')}
 }
 attachMcpLiveRoutes(app,new Set(['http://127.0.0.1:3031']),{broker,enabled:true,writesEnabled:false,providerReady:()=>true,allowCommands:()=>['date']})
 const response=await invoke({id:'id',digest:'digest'})
 assert.equal(response.code,409)
 assert.equal(calls,0)
})
