import React,{useEffect,useState} from 'react'
import {Clock,RefreshCw,Trash2} from 'lucide-react'
export default function AgentSchedules({agents,projectId,busy=false}){
 const [status,setStatus]=useState(null)
 const [ownerKey,setOwnerKey]=useState('')
 const [jobs,setJobs]=useState([])
 const [runs,setRuns]=useState([])
 const [chosen,setChosen]=useState('')
 const [task,setTask]=useState('')
 const [interval,setIntervalMinutes]=useState(1440)
 const [enabled,setEnabled]=useState(false)
 const [working,setWorking]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 useEffect(()=>{let live=true;fetch('/api/agents/status').then(r=>r.json()).then(x=>{if(live)setStatus(x)}).catch(()=>{if(live)setStatus({enabled:false})});return()=>{live=false}},[])
 useEffect(()=>{setChosen('');setTask('')},[projectId])
 async function call(url,method='GET',body){
  const res=await fetch(url,{method,headers:{Authorization:'Bearer '+ownerKey,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})})
  const data=await res.json()
  if(!res.ok)throw Error(data.error||'Scheduling request failed')
  return data
 }
 const action=async fn=>{
  setWorking(true);setError('');setNotice('')
  try{await fn();setNotice('Schedule state updated.')}catch(e){setError(String(e.message||e))}finally{setWorking(false)}
 }
 const refresh=async()=>{
  const result=await call('/api/agents/schedules')
  setJobs(result.jobs||[]);setRuns(result.runs||[])
 }
 const add=()=>action(async()=>{
  const agent=agents.find(a=>a.id===chosen&&a.projectId===projectId)
  if(!agent)throw Error('Choose an agent from the current project')
  if(!task.trim())throw Error('Enter a scheduled task')
  await call('/api/agents/schedules','POST',{projectId,agent:{projectId,name:agent.name,instructions:agent.instructions,role:agent.role},task,intervalMinutes:Number(interval),enabled})
  await refresh()
 })
 const change=(id,patch)=>action(async()=>{await call('/api/agents/schedules/'+encodeURIComponent(id),'PATCH',patch);await refresh()})
 const remove=id=>{if(!window.confirm('Delete this scheduled job and stop future runs?'))return;action(async()=>{await call('/api/agents/schedules/'+encodeURIComponent(id),'DELETE');await refresh()})}
 const run=id=>action(async()=>{await call('/api/agents/schedules/'+encodeURIComponent(id)+'/run','POST');await refresh()})
 return <section className="workspaceCard" aria-label="Scheduled agents">
  <h2><Clock size={17}/> Scheduled agents (opt-in)</h2>
  <p>Unattended execution requires an explicitly enabled local server, a separate environment OpenAI API key, and owner authorization. Jobs keep an instruction snapshot and can outlive project deletion; remove them here separately. No tools or MCP actions are executed.</p>
  {!status?<p>Checking scheduler availability…</p>:!status.enabled?<p className="workspaceToolNote">Disabled by default. Server owner must explicitly configure WORKSPACE_AI_ENABLE_SCHEDULED_AGENTS=true and WORKSPACE_AI_AGENT_OWNER_KEY. This setting does not enable provider writes.</p>:<>
   <label>Owner key (held in this tab only)
    <input type="password" autoComplete="off" value={ownerKey} onChange={e=>setOwnerKey(e.target.value)} placeholder="Local scheduling owner key"/>
   </label>
   <div className="actions"><button className="outline" disabled={busy||working||ownerKey.length<32} onClick={()=>action(refresh)}><RefreshCw size={14}/> Refresh jobs</button></div>
   <label>Agent
    <select aria-label="Scheduled agent" value={chosen} disabled={working||busy} onChange={e=>setChosen(e.target.value)}><option value="">Select agent</option>{agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select>
   </label>
   <label>Scheduled task<textarea rows={3} maxLength={2000} disabled={working||busy} value={task} onChange={e=>setTask(e.target.value)}/></label>
   <label>Interval in minutes (60–10080)<input type="number" min={60} max={10080} step={60} value={interval} disabled={working||busy} onChange={e=>setIntervalMinutes(e.target.value)}/></label>
   <label><input type="checkbox" checked={enabled} disabled={working||busy} onChange={e=>setEnabled(e.target.checked)}/> Enable automatic runs for this job</label>
   <button className="primary" disabled={working||busy||ownerKey.length<32||!chosen||!task.trim()} onClick={add}>Create scheduled job</button>
   {jobs.filter(j=>j.projectId===projectId).map(job=><div className="projectMcpProvider" key={job.id}><strong>{job.agent.name}</strong><p>{job.task}</p><small>Every {job.intervalMinutes} min · {job.enabled?'Enabled':'Paused'}</small>
    <div className="actions"><button className="outline" disabled={working} onClick={()=>change(job.id,{enabled:!job.enabled})}>{job.enabled?'Pause':'Enable'}</button>
     <button className="outline" disabled={working} onClick={()=>run(job.id)}>Run once</button>
     <button className="outline" disabled={working} onClick={()=>remove(job.id)}><Trash2 size={14}/> Remove</button></div></div>)}
   {runs.filter(r=>r.projectId===projectId).slice(0,6).map(r=><details key={r.id}><summary>{r.status} · {new Date(r.startedAt).toLocaleString()}</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{r.output||r.error||'No output yet'}</pre></details>)}
  </>}
  {error&&<p className="projectAlert" role="alert">{error}</p>}
  {notice&&<p className="projectSuccess" role="status">{notice}</p>}
 </section>
}
