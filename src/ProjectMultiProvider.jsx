import React,{useEffect,useRef,useState} from 'react'
import {RefreshCw} from 'lucide-react'
import {projectProviderReadiness,plannedWorkflowReadiness,readSelectedProviders} from './project-multi-provider.js'

export default function ProjectMultiProvider({project}){
 const [connections,setConnections]=useState([])
 const [loading,setLoading]=useState(false)
 const [reading,setReading]=useState(false)
 const [results,setResults]=useState([])
 const [error,setError]=useState('')
 const projectRef=useRef(project.id)
 projectRef.current=project.id
 const refresh=async()=>{
  const projectId=project.id
  setLoading(true);setError('')
  try{
   const res=await fetch('/api/integrations')
   if(!res.ok)throw Error('Connection status unavailable.')
   const data=await res.json()
   if(projectRef.current===projectId)setConnections(Array.isArray(data.services)?data.services:[])
  }catch(e){setError(e.message||'Unable to check provider connections')}
  finally{setLoading(false)}
 }
 useEffect(()=>{setResults([]);void refresh()},[project.id])
 const readiness=projectProviderReadiness(project,connections)
 const steps=plannedWorkflowReadiness(project,connections)
 const apiSet=new Set(project.api||[])
 const ready=readiness.filter(item=>item.ready)
 const readNow=async()=>{
  if(reading||!ready.length)return
  setReading(true);setResults([]);setError('')
  try{const requestedFor=project.id;const items=await readSelectedProviders({project,services:connections});if(projectRef.current===requestedFor)setResults(items)}
  catch(e){setError(e.message||'Provider overview unavailable')}
  finally{setReading(false)}
 }
 return <section className="projectMultiProvider" aria-label="Multi-provider read-only overview">
  <h4>Multi-provider overview</h4>
  <p className="projectHint">Read from multiple selected and connected apps at once. Credentials remain on this app's server; results stay on this screen and are never automatically forwarded between providers, into a chat, or into an MCP tool.</p>
  <div className="projectProviderReadiness">
   {readiness.map(item=><div key={item.id} className="projectProviderReadinessItem">
    <strong>{item.label}</strong><small>{item.ready?'Ready for read':item.reason}</small>
   </div>)}
  </div>
  <div className="actions">
   <button type="button" className="outline" disabled={loading||reading} onClick={refresh}><RefreshCw size={14}/> Refresh connections</button>
   <button type="button" className="outline" disabled={reading||loading||!ready.length} onClick={readNow}>{reading?'Reading…':'Read selected apps together'}</button>
  </div>
  {error&&<p className="projectAlert" role="alert">{error}</p>}
  {!!results.length&&<div className="projectProviderResults">
   {results.map(item=><div key={item.id}>
    <strong>{item.label}</strong>
    {item.status==='error'?<p className="projectHint">{item.error}</p>:<><small>{item.totalReturned} items received · read only</small>
    {item.records.length?<ul>{item.records.map((entry,i)=><li key={i}>{entry}</li>)}</ul>:<p className="projectHint">No results returned.</p>}</>}
   </div>)}
  </div>}
  <details className="projectWorkflowPreview">
   <summary>Gmail → GitHub → Todoist → Google Drive workflow readiness</summary>
   <p className="projectHint">The full multi-app write workflow is not enabled. Each step below requires a separately authorized adapter, the correct provider scopes, per-step project permission, and a reviewed action approval before it can run.</p>
   <ol>{steps.map(step=><li key={step.id}><strong>{step.label}</strong>
    <small>{step.mode.toUpperCase()} · {step.risk} risk · {step.reason}</small></li>)}</ol>
   {!!(project.mcp||[]).length&&<p className="projectHint">Selected MCP services: {(project.mcp||[]).join(', ')}. They use their separate MCP risk permissions and owner-approved execution path; this overview never invokes them.</p>}
   {!apiSet.has('gmail')&&!apiSet.has('google-drive')&&<p className="projectHint">Select Gmail or Google Drive above to plan them for this project. Standalone OAuth remains required before they can be connected.</p>}
  </details>
 </section>
}
