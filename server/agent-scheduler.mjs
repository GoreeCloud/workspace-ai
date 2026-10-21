import fs from 'node:fs/promises'
import {constants as fsConstants} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

const MAX_JOBS=20,MAX_RUNS=20,MAX_DAILY=8
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v)
const safe=(v,n)=>typeof v==='string'?v.trim().slice(0,n):''
export const schedulerPath=()=>path.join(os.homedir(),'.config','goreecloud','workspace-ai','agent-schedules.json')
export function validateScheduledJob(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||!id(value.projectId)||value.agent?.projectId!==value.projectId)throw Error('Scheduled agent must belong to one project')
 const name=safe(value.agent.name,80),instructions=safe(value.agent.instructions,4000),task=safe(value.task,2000)
 if(!name||!instructions||!task)throw Error('Scheduled agent needs instructions and a task')
 if(!Number.isInteger(value.intervalMinutes)||value.intervalMinutes<60||value.intervalMinutes>10080)throw Error('Interval must be 60 to 10080 minutes')
 return {projectId:value.projectId,agent:{projectId:value.projectId,name,instructions,role:safe(value.agent.role,32)},task,intervalMinutes:value.intervalMinutes,enabled:value.enabled===true}
}
export function createAgentScheduler({file=schedulerPath(),infer,now=()=>Date.now(),maxDailyRuns=MAX_DAILY}={}){
 if(typeof infer!=='function')throw Error('An inference provider is required')
 let state={jobs:[],runs:[]},initialized=false,running=false
 let tail=Promise.resolve()
 const serialized=fn=>{const next=tail.then(fn);tail=next.catch(()=>{});return next}
 async function load(){
  if(initialized)return
  let recovered=false
  try{
   const fd=await fs.open(file,fsConstants.O_RDONLY|(fsConstants.O_NOFOLLOW||0))
   let saved
   try{
    const st=await fd.stat()
    if(!st.isFile()||(st.mode&0o077)!==0||st.size>131072)throw Error('Unsafe scheduled-agent storage')
    saved=JSON.parse(await fd.readFile('utf8'))
   }finally{await fd.close()}
   if(!saved||!Array.isArray(saved.jobs)||saved.jobs.length>MAX_JOBS||!Array.isArray(saved.runs)||saved.runs.length>MAX_RUNS)throw Error('Invalid scheduled-agent state')
   state={jobs:saved.jobs.map(job=>{
    if(!id(job.id)||!Number.isFinite(job.nextAt)||!Number.isFinite(job.createdAt))throw Error('Invalid stored scheduled-agent job')
    return {...validateScheduledJob(job),id:job.id,nextAt:job.nextAt,createdAt:job.createdAt}
   }),runs:saved.runs.map(run=>{
    if(!id(run.id)||!id(run.jobId)||!id(run.projectId)||!Number.isFinite(run.startedAt))throw Error('Invalid stored scheduled-agent run')
    if(run.status==='running'){
     recovered=true
     return {...run,status:'failed',error:'Interrupted by a previous server shutdown. Completion is unknown.',finishedAt:now()}
    }
    if(run.status!=='completed'&&run.status!=='failed')throw Error('Unknown saved run status')
    return run
   })}
  }catch(e){if(e.code!=='ENOENT')throw e}
  if(recovered)await save()
  initialized=true
 }
 async function save(){
  await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700})
  const dir=await fs.lstat(path.dirname(file))
  if(!dir.isDirectory()||dir.isSymbolicLink()||(dir.mode&0o077)!==0)throw Error('Unsafe agent storage directory')
  const tmp=file+'.'+crypto.randomUUID()+'.tmp'
  try{await fs.writeFile(tmp,JSON.stringify(state),{mode:0o600,flag:'wx'});await fs.rename(tmp,file)}
  finally{await fs.rm(tmp,{force:true}).catch(()=>{})}
 }
 async function list(){await load();return structuredClone(state)}
 async function add(value){
  await load();if(state.jobs.length>=MAX_JOBS)throw Error('Scheduled agent limit')
  const normalized=validateScheduledJob(value),id=crypto.randomUUID(),started=now()
  const job={...normalized,id,createdAt:started,nextAt:started+normalized.intervalMinutes*60000}
  state.jobs.push(job);await save();return structuredClone(job)
 }
 async function change(jobId,patch){
  await load();const index=state.jobs.findIndex(x=>x.id===jobId);if(index<0)throw Error('Unknown schedule')
  const old=state.jobs[index],normalized=validateScheduledJob({...old,...patch,agent:old.agent})
  const next={...old,...normalized,nextAt:now()+normalized.intervalMinutes*60000}
  state.jobs[index]=next;await save();return structuredClone(next)
 }
 async function remove(jobId){
  await load();const original=state.jobs.length
  state.jobs=state.jobs.filter(x=>x.id!==jobId)
  if(original===state.jobs.length)throw Error('Unknown schedule')
  await save()
 }
 async function removeProject(projectId){
  await load()
  if(!id(projectId))throw Error('Invalid scheduled project identity')
  const jobs=state.jobs.filter(job=>job.projectId===projectId)
  const runs=state.runs.filter(run=>run.projectId===projectId)
  state.jobs=state.jobs.filter(job=>job.projectId!==projectId)
  state.runs=state.runs.filter(run=>run.projectId!==projectId)
  if(jobs.length||runs.length)await save()
  return {projectId,removedJobs:jobs.length,removedRuns:runs.length}
 }
 async function run(jobId){
  await load();if(running)throw Error('Scheduled agent is already running')
  const job=state.jobs.find(x=>x.id===jobId);if(!job)throw Error('Unknown schedule')
  if(state.runs.filter(r=>r.startedAt>=now()-86400000).length>=maxDailyRuns)throw Error('Daily agent usage cap exceeded')
  running=true
  const run={id:crypto.randomUUID(),jobId:job.id,projectId:job.projectId,startedAt:now(),status:'running'}
  state.runs.unshift(run);state.runs=state.runs.slice(0,MAX_RUNS)
  const oldNext=job.nextAt;job.nextAt=now()+job.intervalMinutes*60000
  try{await save()}catch(e){job.nextAt=oldNext;state.runs=state.runs.filter(x=>x.id!==run.id);running=false;throw e}
  try{run.output=safe(await infer({agent:structuredClone(job.agent),task:job.task,projectId:job.projectId}),4000);run.status='completed'}
  catch(e){run.status='failed';run.error=safe(String(e?.message||e),220)}
  finally{run.finishedAt=now();running=false;await save()}
  return structuredClone(run)
 }
 async function tick(){
  await load();if(running)return null
  const next=state.jobs.find(j=>j.enabled&&j.nextAt<=now())
  if(!next)return null
  return run(next.id)
 }
 return {list,add:v=>serialized(()=>add(v)),change:(id,patch)=>serialized(()=>change(id,patch)),remove:id=>serialized(()=>remove(id)),removeProject:projectId=>serialized(()=>removeProject(projectId)),run:id=>serialized(()=>run(id)),tick:()=>serialized(tick)}
}
export async function apiOnlyAgentInference({agent,task,apiKey,model='gpt-5-mini',fetcher=fetch}){
 if(!apiKey)throw Error('A separately billed environment OpenAI API key is required')
 const response=await fetcher('https://api.openai.com/v1/responses',{method:'POST',
  headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},
  body:JSON.stringify({model,store:false,max_output_tokens:600,input:[{role:'user',content:'Agent instructions:\n'+agent.instructions+'\n\nTask:\n'+task+'\n\nSuggest only; no tool use or external actions.'}]}),
  signal:AbortSignal.timeout(45000)})
 if(!response.ok)throw Error('Agent provider returned HTTP '+response.status)
 const output=await response.json()
 return (output.output||[]).flatMap(item=>item.content||[]).filter(x=>x.type==='output_text').map(x=>x.text||'').join('\n').slice(0,4000)
}
