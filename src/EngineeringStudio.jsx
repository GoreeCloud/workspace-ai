import React,{useState} from 'react'
import {Bot,ClipboardCopy,Download,GitBranch,ShieldCheck,Workflow} from 'lucide-react'
import {createEngineeringWorkOrder,DELIVERY_TARGETS,workOrderPrompt} from './engineering-work-order.js'
import {proposeEngineeringAgentTeam} from './engineering-team.js'
import './document-studio.css'

export default function EngineeringStudio({workspace,onWorkspace}){
 const projects=workspace.projects||[]
 const [projectId,setProjectId]=useState('')
 const [repository,setRepository]=useState('GoreeCloud/workspace-ai')
 const [target,setTarget]=useState('web')
 const [goal,setGoal]=useState('')
 const [highRisk,setHighRisk]=useState(false)
 const [order,setOrder]=useState(null)
 const [notice,setNotice]=useState('')
 const [error,setError]=useState('')
 function prepare(){
  try{
   const project=projects.find(p=>p.id===projectId)
   const next=createEngineeringWorkOrder({project:project?.name,repository,target,goal,projectId:projectId||null,safety:highRisk})
   setOrder(next);setNotice('Engineering work order prepared locally. No source changes or builds executed.');setError('')
  }catch(e){setError(e.message);setOrder(null)}
 }
 async function copyPlan(){
  try{await navigator.clipboard.writeText(workOrderPrompt(order));setNotice('Detailed engineering prompt copied.')}
  catch{setError('Clipboard unavailable. Export the work order instead.')}
 }
 function createTeam(){
  try{
   const committed=onWorkspace(old=>({...old,agents:[...(old.agents||[]),...proposeEngineeringAgentTeam(old,order,projectId)]}))
   if(!committed)throw Error('Could not persist agents. Resolve any workspace storage conflict first.')
   setNotice('Four scoped engineering agents created. Open Agents to select and run a team; tools and builds are not executed automatically.')
   setError('')
  }catch(e){setError(e.message)}
 }
 function exportPlan(){
  const bytes=new Blob([JSON.stringify(order,null,2)+'\n'],{type:'application/json'})
  const url=URL.createObjectURL(bytes)
  const a=document.createElement('a');a.href=url;a.download='goreecloud-engineering-work-order.json';a.click()
  setTimeout(()=>URL.revokeObjectURL(url),500)
 }
 return <main className="workspacePage docStudio" aria-label="Engineering work orders">
  <div className="workspacePageTop"><div><h1>Engineering Studio</h1><p>Prepare structured, GoreeCloud-compliant build work orders for project agents and verified development pipelines.</p></div><span className="docTag">Planning foundation</span></div>
  <div className="documentCapabilities" role="region" aria-label="Engineering capabilities" tabIndex={0}>
   <div><Workflow size={20}/><strong>Four engineering roles</strong><small>Architecture, implementation, verification, coordination</small></div>
   <div><ShieldCheck size={20}/><strong>Release evidence gates</strong><small>Native builds, security checks, accessibility and rollback</small></div>
   <div><GitBranch size={20}/><strong>GoreeCloud repositories</strong><small>Explicit GitHub target; plan export doesn't modify code</small></div>
  </div>
  <form className="docPanel engineeringForm" onSubmit={e=>{e.preventDefault();prepare()}}>
   <label>Related project<select value={projectId} onChange={e=>setProjectId(e.target.value)}><option value="">Workspace-wide</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
   <label>Repository<input value={repository} onChange={e=>setRepository(e.target.value)} required maxLength={120} spellCheck={false}/></label>
   <label>Target platform<select value={target} onChange={e=>setTarget(e.target.value)}>{DELIVERY_TARGETS.map(t=><option key={t} value={t}>{t}</option>)}</select></label>
   <label className="docWide">What should be built, improved or stabilized?<textarea value={goal} onChange={e=>setGoal(e.target.value)} rows={5} maxLength={2000} placeholder="Describe deliverable, behavior, constraints and acceptance criteria…" required/></label>
   <label className="docCheck"><input type="checkbox" checked={highRisk} onChange={e=>setHighRisk(e.target.checked)}/> High-risk operations or sensitive data need additional review</label>
   <button className="primary" type="submit"><Workflow size={16}/> Prepare engineering work order</button>
  </form>
  {error&&<p className="notice error" role="alert">{error}</p>}
  {notice&&<p className="documentNotice" role="status">{notice}</p>}
  {order&&<section className="docPanel" aria-label="Work order preview">
   <div className="docPanelTop"><div><h2>{order.repository}</h2><p>{order.objective}</p></div><span className="docTag">{order.mode}</span></div>
   <div className="documentPhases">{order.phases.map((phase,i)=><div className="documentPhase" key={phase.id}>
    <span className="documentStep">{String(i+1).padStart(2,'0')}</span>
    <div><strong>{phase.title}</strong><small>{phase.gate}</small></div>
   </div>)}</div>
   <div className="docActions"><button className="outline" onClick={copyPlan}><ClipboardCopy size={16}/> Copy development prompt</button>
   <button className="primary" onClick={exportPlan}><Download size={16}/> Export work order</button>
   <button className="outline" onClick={createTeam} disabled={!projectId}><Bot size={16}/> Create 4 project agents</button></div>
   <p className="documentHint">Planning only: no agents were launched, no source files were modified, and no releases were created. Run an authorized build pipeline separately.</p>
  </section>}
 </main>
}
