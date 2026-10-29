import React,{useEffect,useState} from 'react'
import {Terminal,Globe,ShieldCheck,Play,RefreshCw,RotateCcw,AlertTriangle,LockKeyhole} from 'lucide-react'
import {browserAccountScope} from './account-workspace-scope.js'

export default function RemoteOperations(){
 const [ownerKey,setOwnerKey]=useState(''),[catalog,setCatalog]=useState(null)
 const [kind,setKind]=useState('ssh'),[target,setTarget]=useState(''),[action,setAction]=useState('')
 const [args,setArgs]=useState('{}'),[task,setTask]=useState(''),[proposal,setProposal]=useState(null)
 const [ticket,setTicket]=useState(null),[approval,setApproval]=useState(''),[critical,setCritical]=useState('')
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const [result,setResult]=useState(null),[audit,setAudit]=useState([])
 const devices=catalog?.devices||[]
 const commands=devices.find(d=>d.id===target)?.commands||[]
 const tools=catalog?.browserTools||[]
 const chosen=kind==='ssh'?commands.find(c=>c.id===action):tools.find(t=>t.name===action)
 const run=async fn=>{setBusy(true);setError('');setNotice('');try{await fn()}catch(e){setError(String(e.message||e))}finally{setBusy(false)}}
 const post=async(path,body={})=>{
  const response=await fetch('/api/remote/'+path,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+ownerKey,'x-workspace-account-id':browserAccountScope()||''},body:JSON.stringify(body)})
  const value=await response.json()
  if(!response.ok)throw Error(value.error||'Operation rejected.')
  return value
 }
 useEffect(()=>{setTicket(null);setApproval('');setCritical('');setResult(null)},[kind,target,action,args])
 const check=()=>run(async()=>{const value=await post('catalog');setCatalog(value);setTicket(null);setNotice(value.enabled?'Operator catalog ready. Nothing executed.':'Remote Operations is disabled on the server.')})
 const suggest=()=>run(async()=>{const value=await post('plan',{task});setProposal(value.available?value.proposal:null);setNotice(value.available?'AI proposed a catalog action only. Review before staging.':value.explanation)})
 const choose=()=>{if(!proposal)return;setKind(proposal.kind);setTarget(proposal.kind==='chrome'?'isolated-chrome':proposal.target);setAction(proposal.action);setArgs(JSON.stringify(proposal.args,null,2));setProposal(null)}
 const stage=()=>run(async()=>{
  if(!chosen)throw Error('Choose an approved action.')
  let input={}
  if(kind==='chrome'){try{input=JSON.parse(args)}catch{throw Error('Invalid JSON arguments.')}}
  const value=await post('stage',{kind,target:kind==='chrome'?'isolated-chrome':target,action,args:input})
  setTicket(value);setResult(null);setNotice('Staged an exact one-time action. Review its destination and effects.')
 })
 const approve=()=>run(async()=>{await post('approve',{id:ticket.id,digest:ticket.digest,confirmation:approval,criticalConfirmation:critical});setTicket(old=>({...old,approved:true}));setNotice('Explicit authorization recorded. The operation has not run.')})
 const execute=()=>run(async()=>{const value=await post('execute',{id:ticket.id,digest:ticket.digest});setTicket(null);setResult(value);setNotice('Action finished. Verify changes on the target before continuing.')})
 const revoke=()=>run(async()=>{await post('revoke');setTicket(null);setNotice('Pending approvals revoked.')})
 const refreshAudit=()=>run(async()=>{setAudit((await post('audit')).events||[])})
 return <section className="workspacePage remoteOps" aria-label="Remote Operations">
  <div className="workspacePageTop"><div><h1>Remote Operations</h1><p>Control approved devices and isolated browser tools through a local, operator-authorized command catalog.</p></div></div>
  <div className="remoteOpsNote"><LockKeyhole size={19}/><span>No unrestricted shell, inherited ChatGPT connectors, or automatic AI execution. Credentials remain server-side or in this temporary page state.</span></div>
  <div className="remoteOpsPanel"><label htmlFor="remote-owner">Operations owner key</label><div className="remoteOpsRow"><input id="remote-owner" type="password" autoComplete="off" spellCheck={false} maxLength={2048} value={ownerKey} onChange={e=>{setOwnerKey(e.target.value);setCatalog(null);setTicket(null)}} placeholder="Private local owner key"/><button className="outline" disabled={busy||ownerKey.length<32} onClick={check}><RefreshCw size={16}/> Check access</button></div></div>
  {catalog&&<><div className="remoteOpsPanel"><h2>Suggest a catalog action</h2><p>Workspace AI may suggest a single existing action, but cannot create or execute commands.</p><label htmlFor="remote-goal">Task description</label><textarea id="remote-goal" rows={3} maxLength={1200} value={task} onChange={e=>{setTask(e.target.value);setProposal(null)}} placeholder="Check disk usage on an authorized VPS"/><button className="outline" disabled={!catalog.enabled||busy||task.trim().length<5} onClick={suggest}>Suggest action</button>{proposal&&<div className="remoteOpsSummary"><strong>AI proposal — not executed</strong><p>{proposal.explanation}</p><code>{proposal.kind} / {proposal.target} / {proposal.action}</code><button className="outline" onClick={choose}>Review this action</button></div>}</div>
   <div className="remoteOpsModes"><button className={kind==='ssh'?'selected':''} onClick={()=>{setKind('ssh');setTarget('');setAction('')}}><Terminal size={21}/><strong>Remote CLI</strong><small>{devices.length} configured devices</small></button><button className={kind==='chrome'?'selected':''} onClick={()=>{setKind('chrome');setTarget('isolated-chrome');setAction('')}}><Globe size={21}/><strong>Chrome MCP</strong><small>{catalog.chromeReady?'Browser connector configured':'Browser connector unavailable'}</small></button></div>
   <div className="remoteOpsPanel">{kind==='ssh'?<><label htmlFor="remote-device">Authorized device</label><select id="remote-device" value={target} onChange={e=>{setTarget(e.target.value);setAction('')}}><option value="">Choose device</option>{devices.map(d=><option key={d.id} value={d.id}>{d.label}</option>)}</select><label htmlFor="remote-command">Exact approved command</label><select id="remote-command" value={action} onChange={e=>setAction(e.target.value)}><option value="">Choose command</option>{commands.map(c=><option key={c.id} value={c.id}>{c.label} · {c.risk}</option>)}</select><small>SSH requires strict host-key verification and a private device inventory. Arbitrary user-entered shell commands are not accepted.</small></>:<><label htmlFor="remote-tool">Reviewed Chrome MCP action</label><select id="remote-tool" value={action} onChange={e=>{setAction(e.target.value);setArgs('{}')}}><option value="">Choose browser tool</option>{tools.map(t=><option key={t.name} value={t.name}>{t.label} · {t.risk}</option>)}</select><label htmlFor="remote-args">Exact tool arguments (JSON)</label><textarea id="remote-args" rows={4} maxLength={2000} spellCheck={false} value={args} onChange={e=>setArgs(e.target.value)}/><small>New websites require an approved HTTPS hostname; the browser uses an isolated profile. Page content is untrusted.</small></>}
    {chosen&&<div className="remoteOpsSummary"><strong>Action awaiting staging</strong><code>{kind==='ssh'?chosen.command:chosen.name+' '+args}</code><small>{chosen.mode} · {chosen.risk} risk</small></div>}
    <div className="remoteOpsRow"><button className="primary" disabled={busy||!catalog.enabled||!chosen} onClick={stage}>Stage action</button><button className="outline" disabled={busy} onClick={revoke}><RotateCcw size={15}/> Revoke staged</button></div>
   </div></>}
  {ticket&&<div className="remoteOpsPanel" role="group" aria-label="Pending exact operation"><h2>Authorize one operation</h2><p><strong>{ticket.target}</strong> · {ticket.action} · {ticket.risk.toUpperCase()} risk</p><code>{ticket.description}</code><p>Expires {new Date(ticket.expiresAt).toLocaleTimeString()}. Cannot be reused.</p>{!ticket.approved?<><label htmlFor="remote-approval">Type APPROVE</label><input id="remote-approval" autoComplete="off" value={approval} onChange={e=>setApproval(e.target.value)}/>{ticket.requiresCriticalConfirmation&&<><label htmlFor="remote-critical">Type CONFIRM CRITICAL</label><input id="remote-critical" autoComplete="off" value={critical} onChange={e=>setCritical(e.target.value)}/></>}<button className="primary" disabled={busy||approval!=='APPROVE'||(ticket.requiresCriticalConfirmation&&critical!=='CONFIRM CRITICAL')} onClick={approve}><ShieldCheck size={16}/> Approve once</button></>:<button className="primary" disabled={busy} onClick={execute}><Play size={16}/> Execute approved action</button>}</div>}
  {error&&<p className="remoteOpsError" role="alert"><AlertTriangle size={16}/>{error}</p>}
  {notice&&<p role="status" className="remoteOpsFeedback">{notice}</p>}
  {result&&<div className="remoteOpsPanel"><h2>Last result</h2><pre>{JSON.stringify(result.result,null,2)}</pre><small>Untrusted provider output. Verify outcomes on the destination.</small></div>}
  {catalog&&<div className="remoteOpsPanel"><div className="remoteOpsRow"><h2>Redacted activity</h2><button className="outline" disabled={busy} onClick={refreshAudit}>Refresh audit</button></div><ul>{audit.slice(-15).reverse().map((event,i)=><li key={i}>{event.at} · {event.event} · {event.target} · {event.action}</li>)}</ul><small>Audit is memory-only and clears on restart.</small></div>}
 </section>
}
