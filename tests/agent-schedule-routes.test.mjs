import test from 'node:test'
import assert from 'node:assert/strict'
import {attachAgentRoutes} from '../server/agent-routes.mjs'
function app(){
 const map=new Map();const add=method=>(path,...handlers)=>map.set(method+' '+path,handlers)
 return {map,get:add('GET'),post:add('POST'),patch:add('PATCH'),delete:add('DELETE')}
}
const service={list:async()=>({jobs:[],runs:[]}),add:async x=>x,change:async()=>({}),remove:async()=>{},run:async()=>({status:'completed'}),tick:async()=>{}}
async function request(chain,headers={}){
 let status=200,data
 const res={status(n){status=n;return this},json(value){data=value;return this}}
 let i=0;const next=async()=>{const fn=chain[i++];if(fn)await fn({headers},res,next)}
 await next();await new Promise(ok=>setImmediate(ok))
 return {status,data}
}
test('unattended agents disabled unless explicitly opted in',async()=>{
 const old=process.env.WORKSPACE_AI_ENABLE_SCHEDULED_AGENTS
 try{
  delete process.env.WORKSPACE_AI_ENABLE_SCHEDULED_AGENTS
  const instance=app();attachAgentRoutes(instance,new Set(['http://127.0.0.1:3031']),{getApiKey:()=>'',scheduler:service})
  const result=await request(instance.map.get('POST /api/agents/schedules'),{origin:'http://127.0.0.1:3031',authorization:'Bearer '+ 'X'.repeat(40)})
  assert.equal(result.status,503)
 }finally{if(old===undefined)delete process.env.WORKSPACE_AI_ENABLE_SCHEDULED_AGENTS;else process.env.WORKSPACE_AI_ENABLE_SCHEDULED_AGENTS=old}
})
test('valid owner key and local Origin required for schedule management',async()=>{
 const enabled=process.env.WORKSPACE_AI_ENABLE_SCHEDULED_AGENTS,secret=process.env.WORKSPACE_AI_AGENT_OWNER_KEY
 try{
  process.env.WORKSPACE_AI_ENABLE_SCHEDULED_AGENTS='true'
  process.env.WORKSPACE_AI_AGENT_OWNER_KEY='Z'.repeat(40)
  const instance=app();attachAgentRoutes(instance,new Set(['http://127.0.0.1:3031']),{getApiKey:()=>'',scheduler:service})
  let result=await request(instance.map.get('GET /api/agents/schedules'),{origin:'https://foreign.example',authorization:'Bearer '+ 'Z'.repeat(40)})
  assert.equal(result.status,403)
  result=await request(instance.map.get('GET /api/agents/schedules'),{origin:'http://127.0.0.1:3031',authorization:'Bearer '+ 'A'.repeat(40)})
  assert.equal(result.status,401)
  result=await request(instance.map.get('GET /api/agents/schedules'),{origin:'http://127.0.0.1:3031',authorization:'Bearer '+ 'Z'.repeat(40)})
  assert.equal(result.status,200)
  assert.deepEqual(result.data,{jobs:[],runs:[]})
 }finally{
  if(enabled===undefined)delete process.env.WORKSPACE_AI_ENABLE_SCHEDULED_AGENTS;else process.env.WORKSPACE_AI_ENABLE_SCHEDULED_AGENTS=enabled
  if(secret===undefined)delete process.env.WORKSPACE_AI_AGENT_OWNER_KEY;else process.env.WORKSPACE_AI_AGENT_OWNER_KEY=secret
 }
})
