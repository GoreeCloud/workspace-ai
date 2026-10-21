import test from 'node:test'
import assert from 'node:assert/strict'
import {discoverMcp} from '../server/integration-routes.mjs'
import {secureMcpPost,validateMcpEndpoint,validateApprovedMcpArguments} from '../server/mcp-executor.mjs'

const envKey='WORKSPACE_MCP_FIRECRAWL_URL'
const envToken='WORKSPACE_MCP_FIRECRAWL_TOKEN'
test('production MCP discovery uses pinned transport and never invokes tools',async()=>{
 const before=process.env[envKey],tokenBefore=process.env[envToken]
 process.env[envKey]='https://public.example.test/mcp'
 process.env[envToken]='synthetic-test-token'
 const calls=[]
 const post=async (url,payload,options)=>{
  assert.equal(String(url),'https://public.example.test/mcp')
  assert.equal(options.token,'synthetic-test-token')
  calls.push(payload.method)
  if(payload.method==='initialize')return {text:JSON.stringify({jsonrpc:'2.0',id:1,result:{capabilities:{tools:{}}}}),session:'session-synthetic'}
  assert.equal(options.session,'session-synthetic')
  if(payload.method==='notifications/initialized')return {text:'',session:'session-synthetic'}
  if(payload.method==='tools/list')return {text:JSON.stringify({jsonrpc:'2.0',id:2,result:{tools:[{name:'read.example',description:'Read only'}]}}),session:'session-synthetic'}
  throw Error('Tool invocation must never occur in discovery')
 }
 try{
  const result=await discoverMcp('firecrawl',undefined,post)
  assert.equal(result.status,'connected')
  assert.deepEqual(calls,['initialize','notifications/initialized','tools/list'])
  assert.equal(result.tools[0].name,'read.example')
  assert.equal(result.tools[0].executable,false)
  assert.ok(!JSON.stringify(result).includes('synthetic-test-token'))
 }finally{
  if(before===undefined)delete process.env[envKey];else process.env[envKey]=before
  if(tokenBefore===undefined)delete process.env[envToken];else process.env[envToken]=tokenBefore
 }
})
test('MCP endpoint configuration denies IPv6 literals and HTTP/private hosts',async()=>{
 for(const input of ['https://[::1]/mcp','https://[2001:db8::1]/mcp','https://127.0.0.1/mcp','http://public.example.test/mcp','https://localhost/mcp']){
  assert.throws(()=>validateMcpEndpoint(input))
 }
 assert.throws(()=>validateApprovedMcpArguments('firecrawl','web.scrape',{url:'https://[::1]/private'},{allowHosts:['[::1]']}),/Only public HTTPS/)
})
test('pinned MCP transport fails before network on loopback or link-local DNS resolution',async()=>{
 const payload={jsonrpc:'2.0',id:1,method:'initialize',params:{}}
 for(const address of ['127.0.0.1','10.2.3.4','169.254.169.254','192.168.1.8']){
  await assert.rejects(()=>secureMcpPost('https://public.example.test/mcp',payload,{lookup:async()=>[{address,family:4}]}),/disallowed network addresses/)
 }
 await assert.rejects(()=>secureMcpPost('https://public.example.test/mcp',payload,{lookup:async()=>[{address:'::1',family:6}]}),/disallowed network addresses/)
})
test('discovery refuses malformed and local endpoint config without issuing requests',async()=>{
 const original=process.env[envKey]
 try{
  for(const url of ['https://[::1]/mcp','http://public.example.test/mcp','https://127.0.0.1/mcp']){
   process.env[envKey]=url
   const result=await discoverMcp('firecrawl',undefined,async()=>{throw Error('Transport should not run')})
   assert.equal(result.status,'setup-required')
  }
 }finally{if(original===undefined)delete process.env[envKey];else process.env[envKey]=original}
})
