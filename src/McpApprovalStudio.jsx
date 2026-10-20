// Explicit owner-authorized, LOCAL dry-run workflow. This cannot call MCP tools.
import React,{useEffect,useMemo,useState} from 'react'
import {trustedMcpClassification} from './mcp-risk-policy.js'

export default function McpApprovalStudio({project}){
 const [ownerKey,setOwnerKey]=useState('')
 const [available,setAvailable]=useState(false)
 const [service,setService]=useState('')
 const [tool,setTool]=useState('')
 const [argumentsText,setArgumentsText]=useState('{}')
 const [approval,setApproval]=useState('')
 const [critical,setCritical]=useState('')
 const [staged,setStaged]=useState(null)
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const [audit,setAudit]=useState([])
 useEffect(()=>{
  let alive=true
  fetch('/api/mcp-approval/status').then(r=>r.json()).then(r=>{if(alive)setAvailable(r.ownerConfigured===true)}).catch(()=>{if(alive)setAvailable(false)})
  return()=>{alive=false}
 },[])
 useEffect(()=>{setStaged(null);setApproval('');setCritical('')},[project.mcp,project.mcpPolicies])
 const tools=useMemo(()=>{
  const output=[]
  for(const provider of (project.mcp||[]))for(const [name,grant] of Object.entries(project.mcpPolicies?.[provider]?.tools||{})){
   if(grant!==true)continue
   const item=trustedMcpClassification(provider,name)
   if(item.reviewed)output.push({provider,name,risk:item.risk})
  }
  return output
 },[project.mcp,project.mcpPolicies])
 const chosen=tools.find(item=>item.provider+'|'+item.name===tool)||null
 const request=async(path,body,method='POST')=>{
  const response=await fetch('/api/mcp-approval/'+path,{
   method,headers:{Origin:location.origin,Authorization:'Bearer '+ownerKey,'Content-Type':'application/json'},
   ...(method==='POST'?{body:JSON.stringify(body)}:{})
  })
  const data=await response.json()
  if(!response.ok)throw Error(data.error||'Approval request rejected')
  return data
 }
 const run=async action=>{
  setBusy(true);setError('');setNotice('')
  try{await action()}catch(e){setError(e.message||'Request failed')}finally{setBusy(false)}
 }
 const register=()=>run(async()=>{
  const result=await request('projects/'+encodeURIComponent(project.id),{mcp:project.mcp||[],mcpPolicies:project.mcpPolicies||{}})
  setStaged(null)
  setNotice('Server-side project grant registered until '+new Date(result.expiresAt).toLocaleTimeString()+'. No tools were executed.')
 })
 const revoke=()=>run(async()=>{
  await request('projects/'+encodeURIComponent(project.id)+'/revoke',{})
  setStaged(null);setNotice('Server-side project grant revoked.')
 })
 const stage=()=>run(async()=>{
  if(!chosen)throw Error('Choose a reviewed, enabled tool.')
  let args;try{args=JSON.parse(argumentsText)}catch{throw Error('Enter valid JSON object arguments.')}
  if(!args||typeof args!=='object'||Array.isArray(args))throw Error('Arguments must be a JSON object.')
  const data=await request('stage',{projectId:project.id,provider:chosen.provider,toolName:chosen.name,args})
  setStaged(data)
  setNotice('Policy preview staged. This does not authorize or execute a provider call.')
 })
 const approve=()=>run(async()=>{
  if(!staged)throw Error('No pending request.')
  await request('approve',{id:staged.id,digest:staged.digest,confirmation:approval,criticalConfirmation:critical})
  setStaged(v=>v?{...v,approved:true}:v)
  setNotice('Approval recorded for this exact short-lived dry-run request.')
 })
 const consume=()=>run(async()=>{
  if(!staged)throw Error('No pending request.')
  const result=await request('consume-dry-run',{id:staged.id,digest:staged.digest})
  setStaged(null)
  setNotice(result.policyValidated&&!result.executed?'Dry run complete: project policy validated. No external tool was called.':'Unexpected dry-run response.')
 })
 const history=()=>run(async()=>{
  const result=await request('audit',null,'GET')
  setAudit((result.events||[]).slice(-10).reverse())
  setNotice('Showing recent redacted, in-memory audit events.')
 })
 return <div className="projectMcpApproval" aria-label="Local MCP approval dry-run">
  <h4>Local server policy and approval dry-run</h4>
  {!available?<p className="projectHint">Disabled: set a unique WORKSPACE_MCP_OWNER_KEY of at least 32 characters in the local server environment, then restart the server. No MCP tools are executed.</p>:
  <><p className="projectHint">Enter your local owner key to register the project policy and preview one-time approvals. The key stays only in this page's temporary state, and is not saved in project backups. Server grants expire after 15 minutes. This is NOT an MCP executor.</p>
   <input type="password" aria-label="Local MCP owner authorization key" placeholder="Local owner key" autoComplete="off" spellCheck={false} maxLength={2048} value={ownerKey} onChange={e=>setOwnerKey(e.target.value)}/>
   <div className="actions"><button type="button" className="outline" disabled={busy||ownerKey.length<32} onClick={register}>Register server policy</button><button type="button" className="outline" disabled={busy||ownerKey.length<32} onClick={revoke}>Revoke policy</button></div>
   <label htmlFor="mcp-preflight-tool">Reviewed allowed tool</label>
   <select id="mcp-preflight-tool" value={tool} onChange={e=>{setTool(e.target.value);setStaged(null)}}>
    <option value="">Choose a tool</option>{tools.map(t=><option key={t.provider+'|'+t.name} value={t.provider+'|'+t.name}>{t.provider} · {t.name} · {t.risk}</option>)}
   </select>
   <label htmlFor="mcp-preflight-args">Exact tool arguments (JSON preview only)</label>
   <textarea id="mcp-preflight-args" rows={3} maxLength={8192} value={argumentsText} onChange={e=>{setArgumentsText(e.target.value);setStaged(null)}}/>
   <button type="button" className="outline" disabled={busy||ownerKey.length<32||!chosen} onClick={stage}>Stage dry-run request</button>
   {staged&&<div className="projectMcpPending"><strong>{staged.risk.toUpperCase()} · {staged.mode.toUpperCase()} · {staged.toolName}</strong>
    <p>Digest: {staged.digest.slice(0,20)}… · Expires {new Date(staged.expiresAt).toLocaleTimeString()}</p>
    {staged.approvalRequired&&!staged.approved&&<><label htmlFor="mcp-preflight-approve">Type APPROVE to approve this exact request</label>
     <input id="mcp-preflight-approve" placeholder="APPROVE" value={approval} onChange={e=>setApproval(e.target.value)}/>
     {staged.criticalConfirmationRequired&&<><label htmlFor="mcp-preflight-critical">Separately type CONFIRM CRITICAL</label><input id="mcp-preflight-critical" placeholder="CONFIRM CRITICAL" value={critical} onChange={e=>setCritical(e.target.value)}/></>}
     <button type="button" className="outline" disabled={busy||approval!=='APPROVE'||(staged.criticalConfirmationRequired&&critical!=='CONFIRM CRITICAL')} onClick={approve}>Record one-time approval</button></>}
    <button type="button" className="outline" disabled={busy||(staged.approvalRequired&&!staged.approved)} onClick={consume}>Validate and consume (no execution)</button>
   </div>}
   <button type="button" className="outline" disabled={busy||ownerKey.length<32} onClick={history}>Show redacted audit</button>
   {audit.length>0&&<ul className="projectMcpAudit">{audit.map((a,i)=><li key={a.time+'-'+i}>{a.event} · {a.provider||a.projectId} · {new Date(a.time).toLocaleTimeString()}</li>)}</ul>}
  </>}
  {error&&<p className="projectAlert" role="alert">{error}</p>}
  {notice&&<p className="projectSuccess" role="status">{notice}</p>}
 </div>
}
