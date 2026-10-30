import React,{useEffect,useRef,useState} from 'react'
import {Bot,Plus,Trash2,Play,Square,ShieldCheck} from 'lucide-react'
import {AGENT_MAX_COUNT,AGENT_TEAM_MAX,newAgent,normalizeAgent,normalizeAgents} from './agent-model.js'
import {executeAgentTeam,queryAgent} from './agent-runner.js'
import AgentSchedules from './AgentSchedules.jsx'
import {projectContext} from './project-model.js'

export default function AgentStudio({workspace,onWorkspace,selectedProject,onProject,onOpenProject,busy=false}){
 const projects=workspace.projects||[]
 const [projectId,setProjectId]=useState(selectedProject||projects[0]?.id||'')
 const [selection,setSelection]=useState([])
 const [task,setTask]=useState('')
 const [provider,setProvider]=useState('api')
 const [model,setModel]=useState('')
 const [planModels,setPlanModels]=useState([])
 const [synthesize,setSynthesize]=useState(false)
 const [working,setWorking]=useState(false)
 const [error,setError]=useState('')
 const [results,setResults]=useState([])
 const [summary,setSummary]=useState('')
 const controller=useRef(null)
 useEffect(()=>{let active=true;fetch('/api/models').then(r=>r.json()).then(data=>{if(active)setPlanModels(data.planModels||[])}).catch(()=>{});return()=>{active=false}},[])
 useEffect(()=>{if(!projects.some(p=>p.id===projectId))setProjectId(projects[0]?.id||'')},[workspace.projects])
 useEffect(()=>{setSelection([]);setResults([]);setSummary('')},[projectId])
 const agents=normalizeAgents(workspace.agents||[],projects)
 const local=agents.filter(a=>a.projectId===projectId)
 const selected=selection.map(id=>local.find(a=>a.id===id)).filter(Boolean)
 const coordinator=local.find(a=>a.role==='coordinator'&&!selection.includes(a.id))
 const updateAgents=change=>{
  try{
   if(busy||working)throw Error('Stop the active run first.')
   const next=normalizeAgents(typeof change==='function'?change(agents):change,projects)
   if(!onWorkspace(w=>({...w,agents:next})))throw Error('Browser storage rejected the change.')
   setError('');return true
  }catch(e){setError(e.message);return false}
 }
 const create=()=>{
  if(!projectId||agents.length>=AGENT_MAX_COUNT)return
  updateAgents(list=>[...list,newAgent(projectId)])
 }
 const patch=(id,update)=>updateAgents(list=>list.map(a=>a.id===id?normalizeAgent({...a,...update,updatedAt:Date.now()},projects):a))
 const remove=id=>{
  if(!window.confirm('Delete this agent from the workspace? Existing runs remain visible until you leave this page.'))return
  if(updateAgents(list=>list.filter(a=>a.id!==id)))setSelection(ids=>ids.filter(v=>v!==id))
 }
 async function run(){
  if(!projectId||!task.trim()||selected.length===0||working||busy)return
  if(provider==='plan'&&!model){setError('Choose an available ChatGPT plan model.');return}
  const abort=new AbortController();controller.current=abort
  setWorking(true);setError('');setResults([]);setSummary('')
  try{
   const context=projectContext(workspace,projectId,task)
   const output=await executeAgentTeam({agents:selected,projectId,task,context,preference:provider,model,signal:abort.signal,onProgress:()=>{}})
   setResults(output)
   if(synthesize&&coordinator&&!abort.signal.aborted){
    const combined=output.filter(x=>x.status==='completed').map(x=>x.name+':\n'+x.output).join('\n\n').slice(0,8500)
    if(combined){
     const synthesis=await queryAgent({agent:coordinator,task:'Synthesize these independent agent findings for the original task: '+task+'\n\nAgent outputs:\n'+combined,context,preference:provider,model,signal:abort.signal})
     setSummary(synthesis)
    }
   }
  }catch(e){setError(abort.signal.aborted?'Agent run cancelled.':String(e.message||e))}
  finally{controller.current=null;setWorking(false)}
 }
 return <div className="workspacePage" aria-label="Agent Studio">
  <div className="workspacePageTop"><div><h1><Bot size={24}/> Agent Studio</h1><p>Create project-specific agents and run up to four supervised workers in parallel.</p></div>
   <button className="outline" type="button" disabled={!projectId} onClick={()=>onOpenProject(projectId)}>Project settings</button></div>
  <p className="workspaceToolNote"><ShieldCheck size={15}/> Agents can use only the selected project's instructions, enabled private memory and reference context. External MCP/API tool actions are not executable through this studio.</p>
  <div className="workspaceCard">
   <label>Agent project
    <select aria-label="Agent project" value={projectId} onChange={e=>setProjectId(e.target.value)} disabled={working}>
     {projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
   </label>
   {projects.length===0?<p>Create a project before adding agents.</p>:<div className="actions"><button type="button" className="primary" onClick={create} disabled={working||busy||agents.length>=AGENT_MAX_COUNT}><Plus size={15}/> New agent</button><small>{local.length} agents in this project · {agents.length}/{AGENT_MAX_COUNT} overall</small></div>}
  </div>
  {local.map(a=><section className="workspaceCard" key={a.id}>
   <div className="actions"><label><input type="checkbox" aria-label={'Select '+a.name} disabled={working||busy} checked={selection.includes(a.id)} onChange={e=>setSelection(old=>e.target.checked?old.length<AGENT_TEAM_MAX?[...old,a.id]:old:old.filter(id=>id!==a.id))}/> Use in team</label><button className="outline" type="button" disabled={working||busy} onClick={()=>remove(a.id)}><Trash2 size={14}/> Delete agent</button></div>
   <label>Agent name<input value={a.name} maxLength={80} disabled={working||busy} onChange={e=>{if(e.target.value.trim())patch(a.id,{name:e.target.value})}}/></label>
   <label>Role<select value={a.role} disabled={working||busy} onChange={e=>patch(a.id,{role:e.target.value})}>
    {['general','research','developer','reviewer','coordinator'].map(role=><option key={role} value={role}>{role}</option>)}
   </select></label>
   <label>Instructions<textarea rows={4} maxLength={4000} value={a.instructions} disabled={working||busy} onChange={e=>{if(e.target.value.trim())patch(a.id,{instructions:e.target.value})}}/></label>
  </section>)}
  <section className="workspaceCard">
   <h2>Supervised execution</h2>
   <p>{selected.length} of {AGENT_TEAM_MAX} agents selected. Runs are started manually, incur model-provider usage, and have no external tool access.</p>
   <div className="agentExecutionFields">
    <label className="agentTaskField">Task<textarea aria-label="Agent task" rows={4} maxLength={12000} disabled={working||busy} value={task} onChange={e=>setTask(e.target.value)} placeholder="Describe the work for these agents"/></label>
    <div className="agentExecutionControls">
     <label>Model provider<select aria-label="Agent model provider" disabled={working} value={provider} onChange={e=>setProvider(e.target.value)}><option value="api">OpenAI API (separately billed)</option><option value="plan">ChatGPT plan (when eligible)</option></select></label>
     {provider==='plan'&&<label>Plan model<select aria-label="Agent plan model" disabled={working} value={model} onChange={e=>setModel(e.target.value)}><option value="">Choose model</option>{planModels.map(m=><option key={m.slug} value={m.slug}>{m.name}</option>)}</select></label>}
    </div>
   </div>
   <label className="agentSynthesisOption"><input type="checkbox" checked={synthesize} disabled={working||!coordinator} onChange={e=>setSynthesize(e.target.checked)}/><span>Run coordinator synthesis<small>Requires a separate coordinator agent in this project.</small></span></label>
   <div className="actions agentExecutionActions"><button className="primary" disabled={busy||working||!task.trim()||!selected.length} onClick={run}><Play size={15}/> Run selected agents</button>
    <button className="outline" disabled={!working} onClick={()=>controller.current?.abort()}><Square size={15}/> Stop</button></div>
  </section>
  <AgentSchedules agents={local} projectId={projectId} busy={working||busy}/>
  {error&&<p role="alert" className="projectAlert">{error}</p>}
  {results.map(result=><section key={result.agentId} className="workspaceCard"><h3>{result.name} · {result.status}</h3><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{result.status==='completed'?result.output:result.error}</pre></section>)}
  {summary&&<section className="workspaceCard"><h3>Coordinator synthesis</h3><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{summary}</pre></section>}
 </div>
}
