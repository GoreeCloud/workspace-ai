import React,{useState} from 'react'
import {Plus,Trash2,ShieldCheck} from 'lucide-react'
import {MAX_MCP_ACCOUNTS,normalizeMcpAccounts,normalizeResourcePath} from './project-mcp-accounts.js'
const PROVIDERS=['todoist','google-drive','gmail','github','dropbox','linear','cloudflare','firecrawl','remote-desktop-commander']
export default function ProjectMcpAccounts({project,onUpdate,busy=false}){
 const [provider,setProvider]=useState('todoist')
 const [custom,setCustom]=useState('')
 const [label,setLabel]=useState('')
 const [error,setError]=useState('')
 const accounts=project.mcpAccounts||[]
 const change=(id,patch)=>{
  try{
   if(!onUpdate({mcpAccounts:normalizeMcpAccounts(accounts.map(p=>p.id===id?{...p,...patch}:p))}))throw Error('Changes were not saved.')
   setError('')
  }catch(e){setError(e.message)}
 }
 const add=()=>{
  try{
   const chosen=provider==='custom'?custom.trim().toLowerCase():provider
   const title=label.trim()
   const candidate={id:crypto.randomUUID(),provider:chosen,accountLabel:title,connectionId:'',enabled:false,read:false,write:false,resourceRoots:[],tools:[]}
   if(!onUpdate({mcpAccounts:normalizeMcpAccounts([...accounts,candidate])}))throw Error('Changes were not saved.')
   setLabel('');setError('')
  }catch(e){setError(e.message)}
 }
 const editList=(account,kind,value)=>{
  try{
   let parsed
   if(kind==='resourceRoots')parsed=[...new Set(value.split(/\r?\n/).map(v=>v.trim()).filter(Boolean).map(normalizeResourcePath))]
   else parsed=[...new Set(value.split(/\r?\n/).map(v=>v.trim()).filter(Boolean))]
   change(account.id,{[kind]:parsed})
  }catch(e){setError(e.message)}
 }
 return <section className="projectMcpAccounts" aria-label="Project-specific MCP accounts">
  <h4>MCP accounts and resource boundaries</h4>
  <p className="projectHint">Configure multiple account bindings independently for this project, even for the same provider. These are <strong>local profiles, not connected accounts</strong>: labels and connection references never authenticate anyone. A server-verified account, provider-side resource enforcement, and owner approval are required before any external tool runs. No passwords or tokens belong here.</p>
  <div className="projectCloudRow">
   <select aria-label="Account provider" value={provider} onChange={e=>setProvider(e.target.value)} disabled={busy}>
    {PROVIDERS.map(p=><option key={p} value={p}>{p}</option>)}<option value="custom">Other MCP provider…</option>
   </select>
   {provider==='custom'&&<input aria-label="Custom MCP provider identifier" maxLength={80} value={custom} onChange={e=>setCustom(e.target.value)} placeholder="provider-id"/>}
   <input aria-label="Account label" maxLength={120} value={label} onChange={e=>setLabel(e.target.value)} placeholder="Account name / email"/>
   <button className="outline" type="button" disabled={busy||!label.trim()||accounts.length>=MAX_MCP_ACCOUNTS} onClick={add}><Plus size={15}/> Add account</button>
  </div>
  {accounts.length===0&&<p className="projectHint">No accounts configured for this project. All account access is denied.</p>}
  {accounts.map(account=><details key={account.id} className="projectMcpProvider">
   <summary>{account.provider} · {account.accountLabel} · {account.enabled?'Configured':'Disabled'}</summary>
   <p className="projectHint">Account reference: not connected or authenticated by this profile alone.</p>
   <label>Account label
    <input aria-label={'Account label '+account.id} value={account.accountLabel} maxLength={120} disabled={busy} onChange={e=>{if(e.target.value.trim())change(account.id,{accountLabel:e.target.value})}}/>
   </label>
   <label>Server-issued connection reference
    <input aria-label={'Connection reference '+account.id} value={account.connectionId} maxLength={160} disabled={busy} onChange={e=>change(account.id,{connectionId:e.target.value})} placeholder="Verified connection ID — not a token"/>
   </label>
   <div className="projectMcpModes">
    {['enabled','read','write'].map(field=><label key={field}><input type="checkbox" checked={account[field]} disabled={busy} onChange={e=>change(account.id,{[field]:e.target.checked})}/>{field==='enabled'?'Enable this project profile':field==='read'?'Permit reads':'Permit writes (additional approval required)'}</label>)}
   </div>
   <label>Allowed resource roots (absolute paths, one per line)
    <textarea key={account.id+'-roots-'+account.resourceRoots.join('|')} rows={3} aria-label={'Resource scopes '+account.id} defaultValue={account.resourceRoots.join('\n')} disabled={busy} placeholder="/Projects/Alpha" onBlur={e=>editList(account,'resourceRoots',e.target.value)}/>
   </label>
   <label>Individually approved tool names (one per line)
    <textarea key={account.id+'-tools-'+account.tools.join('|')} rows={2} aria-label={'Account tools '+account.id} defaultValue={account.tools.join('\n')} disabled={busy} placeholder="tasks.list" onBlur={e=>editList(account,'tools',e.target.value)}/>
   </label>
   <p className="projectHint">Resource roots and tool lists limit this project's intended access. No tool may run on browser settings alone. Always validate the actual provider identity and provider-enforced resource permissions.</p>
   <button type="button" className="outline" disabled={busy} onClick={()=>{if(!window.confirm('Remove this MCP account profile from '+project.name+'?'))return;try{if(!onUpdate({mcpAccounts:accounts.filter(a=>a.id!==account.id)}))throw Error('Changes were not saved.');setError('')}catch(e){setError(e.message)}}}><Trash2 size={15}/> Remove project account profile</button>
  </details>)}
  {error&&<p className="projectAlert" role="alert">{error}</p>}
  <p className="projectHint"><ShieldCheck size={13}/> Accounts can be referenced by multiple projects, but their enablement, resource roots and tool grants never carry across automatically.</p>
 </section>
}
