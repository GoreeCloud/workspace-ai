import test from 'node:test'
import assert from 'node:assert/strict'
import {discoverMcp} from '../server/integration-routes.mjs'

test('MCP discovery acknowledges initialization and never invokes tools',async()=>{
 const urlKey='WORKSPACE_MCP_FIRECRAWL_URL'
 const tokenKey='WORKSPACE_MCP_FIRECRAWL_TOKEN'
 const savedUrl=process.env[urlKey],savedToken=process.env[tokenKey]
 process.env[urlKey]='https://mcp.test.example/mcp'
 process.env[tokenKey]='synthetic-mcp-test-token'
 const requests=[]
 const fetchImpl=async(url,options)=>{
  assert.equal(url,'https://mcp.test.example/mcp')
  assert.equal(options.method,'POST')
  assert.equal(options.redirect,'error')
  assert.equal(options.headers.Authorization,'Bearer synthetic-mcp-test-token')
  const payload=JSON.parse(options.body)
  requests.push({method:payload.method,session:options.headers['Mcp-Session-Id']})
  if(payload.method==='initialize')return {ok:true,headers:{get:key=>key==='mcp-session-id'?'session-a':null},text:async()=>JSON.stringify({jsonrpc:'2.0',id:1,result:{protocolVersion:'2025-06-18',capabilities:{}}})}
  assert.equal(options.headers['Mcp-Session-Id'],'session-a')
  if(payload.method==='notifications/initialized')return {ok:true,status:202}
  if(payload.method==='tools/list')return {ok:true,headers:{get:()=>null},text:async()=>JSON.stringify({jsonrpc:'2.0',id:2,result:{tools:[{name:'web.scrape',description:'Navigate pages'}]}})}
  throw Error('Unwanted MCP method '+payload.method)
 }
 try{
  const result=await discoverMcp('firecrawl',fetchImpl)
  assert.equal(result.status,'connected')
  assert.deepEqual(requests.map(r=>r.method),['initialize','notifications/initialized','tools/list'])
  assert.equal(result.tools.length,1)
  assert.equal(result.tools[0].executable,false)
  assert.equal(result.tools[0].requiresApproval,true)
  assert.ok(!JSON.stringify(result).includes('synthetic-mcp-test-token'))
 }finally{
  if(savedUrl===undefined)delete process.env[urlKey];else process.env[urlKey]=savedUrl
  if(savedToken===undefined)delete process.env[tokenKey];else process.env[tokenKey]=savedToken
 }
})

test('MCP discovery denies insecure or local endpoints',async()=>{
 const key='WORKSPACE_MCP_FIRECRAWL_URL'
 const original=process.env[key]
 try{
  for(const url of ['http://localhost:8022/mcp','https://127.0.0.1/mcp','http://mcp.test.example/mcp']){
   process.env[key]=url
   const result=await discoverMcp('firecrawl',async()=>{throw Error('Network must not be called')})
   assert.equal(result.status,'setup-required')
  }
 }finally{if(original===undefined)delete process.env[key];else process.env[key]=original}
})
