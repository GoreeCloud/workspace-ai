import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {normalizeAgent,normalizeAgents,assertAgentTeam} from '../src/agent-model.js'
import {queryAgent,executeAgentTeam} from '../src/agent-runner.js'
import {validateScheduledJob,createAgentScheduler,apiOnlyAgentInference} from '../server/agent-scheduler.mjs'
import {createWorkspaceBackup,parseWorkspaceBackup,prepareWorkspaceRestore} from '../src/workspace-backup.js'
import {newProject} from '../src/project-model.js'

const projects=[newProject('alpha','Alpha'),newProject('beta','Beta')]
const agent={id:'agent_a',projectId:'alpha',name:'Researcher',role:'research',instructions:'Use only local project context.'}
const scheduled={projectId:'alpha',agent:{projectId:'alpha',name:'Auditor',instructions:'Review provided facts only'},task:'Review this project',intervalMinutes:60,enabled:true}
test('agent identity and team membership never cross project boundaries',()=>{
 assert.throws(()=>normalizeAgent({...agent,projectId:'missing'},projects),/existing project/)
 assert.deepEqual(normalizeAgents([agent,{...agent,id:'bad',projectId:'missing'}],projects).map(a=>a.id),['agent_a'])
 assert.throws(()=>assertAgentTeam([agent,{...agent,id:'agent_b',projectId:'beta'}],'alpha'),/Cross-project/)
 assert.throws(()=>assertAgentTeam([agent,agent],'alpha'),/Duplicate/)
 assert.throws(()=>assertAgentTeam(Array.from({length:5},(_,i)=>({...agent,id:'a'+i})),'alpha'),/one to four/)
})
const mock=async (_url,opts)=>{
 const body=JSON.parse(opts.body)
 assert.equal(body.messages.length,1);assert.equal(body.allowApiFallback,false)
 return {ok:true,body:new ReadableStream({start(c){const bytes=new TextEncoder();for(const e of [{type:'delta',text:'Completed'},{type:'complete'}])c.enqueue(bytes.encode(JSON.stringify(e)+'\n'));c.close()}})}
}
test('agent model requests never enable tool execution or fallback',async()=>{
 assert.equal(await queryAgent({agent,task:'Summarize',context:'Alpha memory only',fetcher:mock}),'Completed')
 const results=await executeAgentTeam({agents:[agent,{...agent,id:'agent_b',name:'Reviewer'}],projectId:'alpha',task:'Review',fetcher:mock})
 assert.deepEqual(results.map(r=>r.output),['Completed','Completed'])
})
test('agent inference cancels unbounded undelimited streams without tool calls',async()=>{
 let cancelled=false
 const fetcher=async(_url,opts)=>{
  assert.equal(JSON.parse(opts.body).allowApiFallback,false)
  return {ok:true,body:new ReadableStream({
   start(sink){sink.enqueue(new TextEncoder().encode('x'.repeat(40000)))},
   cancel(){cancelled=true}
  })}
 }
 await assert.rejects(queryAgent({agent,task:'Audit synthetic data',fetcher}),/event exceeded limit/)
 assert.equal(cancelled,true)
})

test('agent inference rejects oversized deltas and closes upstream streams',async()=>{
 let cancelled=false
 const fetcher=async()=>({ok:true,body:new ReadableStream({
  start(sink){sink.enqueue(new TextEncoder().encode(JSON.stringify({type:'delta',text:'x'.repeat(24001)})+'\\n'))},
  cancel(){cancelled=true}
 })})
 await assert.rejects(queryAgent({agent,task:'Summarize',fetcher}),/reply exceeded limit/)
 assert.equal(cancelled,true)
})

test('agent inference handles fragmented stream events and rejects missing completion',async()=>{
 const encoder=new TextEncoder()
 const stream=(pieces)=>async()=>({ok:true,body:new ReadableStream({
  start(sink){for(const piece of pieces)sink.enqueue(encoder.encode(piece));sink.close()}
 })})
 assert.equal(await queryAgent({agent,task:'Summarize',fetcher:stream([
  '{"type":"del','ta","text":"Hello"}\\n{"type":"complete"}\\n'
 ])}),'Hello')
 await assert.rejects(queryAgent({agent,task:'Summarize',fetcher:stream([
  '{"type":"delta","text":"Incomplete"}\\n'
 ])}),/ended unexpectedly/)
})

test('agent backups preserve valid project agents and skip orphaned agents',()=>{
 const workspace={projects,pinned:[],collapsed:false,expanded:{},agents:[agent]}
 const data=createWorkspaceBackup([],workspace)
 const restored=parseWorkspaceBackup(JSON.stringify(data))
 assert.deepEqual(restored.workspace.agents.map(a=>a.id),['agent_a'])
 const merged=prepareWorkspaceRestore([],{projects:[projects[0]],agents:[],prompts:[],pinned:[],expanded:{}},data,'merge')
 assert.equal(merged.workspace.agents.length,0) // Project ID alpha already exists locally
 assert.equal(restored.workspace.agents[0].projectId,'alpha')
})
test('scheduled jobs enforce single-project identity and hourly minimum',()=>{
 assert.throws(()=>validateScheduledJob({...scheduled,agent:{...scheduled.agent,projectId:'beta'}}),/one project/)
 assert.throws(()=>validateScheduledJob({...scheduled,intervalMinutes:5}),/60/)
})
test('agent scheduler persists and restores results with private file permissions',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'goreecloud-agents-'))
 try{
  await fs.chmod(dir,0o700)
  const file=path.join(dir,'schedule.json'),clock={now:100000}
  const clockFn=()=>clock.now
  const scheduler=createAgentScheduler({file,now:clockFn,infer:async()=> 'Synthetic result'})
  const job=await scheduler.add(scheduled)
  assert.equal((await scheduler.list()).jobs.length,1)
  clock.now+=3600002
  assert.equal((await scheduler.tick()).status,'completed')
  const restored=createAgentScheduler({file,now:clockFn,infer:async()=> 'Other'})
  assert.equal((await restored.list()).runs[0].output,'Synthetic result')
  await restored.change(job.id,{enabled:false})
  assert.equal((await restored.list()).jobs[0].enabled,false)
  await restored.remove(job.id)
  assert.equal((await restored.list()).jobs.length,0)
 }finally{await fs.rm(dir,{recursive:true,force:true})}
})
test('scheduled model inference uses API without tools and disables provider storage',async()=>{
 const text=await apiOnlyAgentInference({agent:scheduled.agent,task:scheduled.task,apiKey:'synthetic',fetcher:async (url,opts)=>{
  assert.equal(url,'https://api.openai.com/v1/responses')
  const body=JSON.parse(opts.body)
  assert.equal(body.store,false);assert.equal(body.tools,undefined)
  return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:'Confirmed'}]}]})}
 }})
 assert.equal(text,'Confirmed')
})
test('Agent Studio source is wired to navigation, backup and server routes',async()=>{
 const files=await Promise.all(['src/WorkspaceNavigation.jsx','src/WorkspaceViews.jsx','src/workspace-state.js','src/workspace-backup.js','server/index.mjs'].map(x=>readFile(new URL('../'+x,import.meta.url),'utf8')))
 assert.match(files[0],/agents:Bot/)
 assert.match(files[1],/view==='agents'/)
 assert.match(files[2],/agents:normalizeAgents/)
 assert.match(files[3],/agents:normalizeAgents/)
 assert.match(files[4],/attachAgentRoutes\(app,localOrigins/)
})
