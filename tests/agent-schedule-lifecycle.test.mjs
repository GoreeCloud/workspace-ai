import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm,readFile,writeFile,chmod,symlink,unlink} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {createAgentScheduler} from '../server/agent-scheduler.mjs'
import {attachAgentRoutes} from '../server/agent-routes.mjs'

const job=id=>({projectId:id,agent:{projectId:id,name:'Synthetic assistant',instructions:'Review synthetic input only.'},task:'Synthetic audit',intervalMinutes:60,enabled:true})
const fixture=async fn=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'workspace-agents-schedule-'))
 try{await chmod(directory,0o700);return await fn(path.join(directory,'jobs.json'),directory)}
 finally{await rm(directory,{recursive:true,force:true})}
}
test('owner can revoke project schedules and purge only that project run history',()=>fixture(async file=>{
 let now=10000
 const scheduler=createAgentScheduler({file,now:()=>now,infer:async({projectId})=>'Synthetic result: '+projectId})
 const a=await scheduler.add(job('alpha'))
 const b=await scheduler.add(job('beta'))
 await scheduler.run(a.id);await scheduler.run(b.id)
 const before=await scheduler.list()
 assert.equal(before.jobs.length,2);assert.equal(before.runs.length,2)
 const revoked=await scheduler.removeProject('alpha')
 assert.deepEqual(revoked,{projectId:'alpha',removedJobs:1,removedRuns:1})
 assert.deepEqual((await scheduler.list()).jobs.map(x=>x.projectId),['beta'])
 assert.deepEqual((await scheduler.list()).runs.map(x=>x.projectId),['beta'])
 const reloaded=createAgentScheduler({file,infer:async()=>''})
 assert.deepEqual((await reloaded.list()).jobs.map(x=>x.projectId),['beta'])
 await assert.rejects(()=>reloaded.run(a.id),/Unknown schedule/)
 assert.deepEqual(await reloaded.removeProject('alpha'),{projectId:'alpha',removedJobs:0,removedRuns:0})
 await assert.rejects(()=>reloaded.removeProject('../beta'),/Invalid scheduled project/)
}))
test('restart marks interrupted runs as failed without replaying or leaking their output',()=>fixture(async file=>{
 const scheduler=createAgentScheduler({file,now:()=>50000,infer:async()=> 'synthetic'})
 const scheduled=await scheduler.add(job('alpha'))
 const saved=JSON.parse(await readFile(file,'utf8'))
 saved.runs=[{id:'unfinished_run',jobId:scheduled.id,projectId:'alpha',startedAt:49000,status:'running'}]
 await writeFile(file,JSON.stringify(saved),{mode:0o600})
 const restarted=createAgentScheduler({file,now:()=>80000,infer:async()=>{throw Error('must not infer during load')}})
 const view=await restarted.list()
 assert.equal(view.runs[0].status,'failed')
 assert.match(view.runs[0].error,/Completion is unknown/)
 assert.equal(view.runs[0].finishedAt,80000)
 assert.equal((await restarted.list()).jobs.length,1)
 const second=createAgentScheduler({file,now:()=>90000,infer:async()=>''})
 assert.equal((await second.list()).runs[0].finishedAt,80000)
}))
test('the stored schedule file cannot be read through a symlink',()=>fixture(async(file,directory)=>{
 const store=createAgentScheduler({file,infer:async()=>''})
 await store.add(job('alpha'))
 const target=path.join(directory,'backup.json')
 await writeFile(target,await readFile(file),{mode:0o600})
 await unlink(file);await symlink(target,file)
 const reopened=createAgentScheduler({file,infer:async()=>''})
 await assert.rejects(()=>reopened.list())
}))
test('only valid local-origin owner-key requests can revoke project jobs',async()=>{
 const enabled=process.env.WORKSPACE_AI_ENABLE_SCHEDULED_AGENTS,key=process.env.WORKSPACE_AI_AGENT_OWNER_KEY
 process.env.WORKSPACE_AI_ENABLE_SCHEDULED_AGENTS='true'
 process.env.WORKSPACE_AI_AGENT_OWNER_KEY='S'.repeat(40)
 try{
  const handlers=new Map()
  const app={get:(p,...xs)=>handlers.set('GET '+p,xs),post:(p,...xs)=>handlers.set('POST '+p,xs),patch:(p,...xs)=>handlers.set('PATCH '+p,xs),delete:(p,...xs)=>handlers.set('DELETE '+p,xs)}
  let calls=0
  const scheduler={removeProject:async projectId=>{calls++;return {projectId,removedJobs:1,removedRuns:2}}}
  attachAgentRoutes(app,new Set(['http://127.0.0.1:3031']),{scheduler})
  const route=handlers.get('DELETE /api/agents/projects/:projectId/schedules')
  assert.equal(route.length,2)
  const request=async(origin,auth)=>{
   const req={headers:{origin,authorization:'Bearer '+auth},params:{projectId:'alpha'}}
   let code=200,value
   const response={status:n=>{code=n;return response},json:x=>{value=x;return response}}
   await new Promise(resolve=>{
    route[0](req,response,()=>{route[1](req,response);resolve()})
    if(code!==200)resolve()
   })
   if(code===200)await new Promise(ok=>setImmediate(ok))
   return {code,value}
  }
  assert.equal((await request('https://untrusted.example','S'.repeat(40))).code,403)
  assert.equal((await request('http://127.0.0.1:3031','invalid')).code,401)
  const allowed=await request('http://127.0.0.1:3031','S'.repeat(40))
  assert.equal(allowed.code,200)
  assert.deepEqual(allowed.value,{projectId:'alpha',removedJobs:1,removedRuns:2})
  assert.equal(calls,1)
 }finally{
  if(enabled===undefined)delete process.env.WORKSPACE_AI_ENABLE_SCHEDULED_AGENTS;else process.env.WORKSPACE_AI_ENABLE_SCHEDULED_AGENTS=enabled
  if(key===undefined)delete process.env.WORKSPACE_AI_AGENT_OWNER_KEY;else process.env.WORKSPACE_AI_AGENT_OWNER_KEY=key
 }
})
