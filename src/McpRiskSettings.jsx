import React,{useEffect,useState} from 'react'
import {defaultMcpPolicy,MCP_RISK_TIERS,normalizeMcpPolicies,trustedMcpClassification} from './mcp-risk-policy.js'
import McpApprovalStudio from './McpApprovalStudio.jsx'
const labels={'remote-desktop-commander':'Remote Desktop Commander',firecrawl:'Firecrawl'}
const title=value=>value.charAt(0).toUpperCase()+value.slice(1)
export default function McpRiskSettings({project,onUpdate}){
 const [services,setServices]=useState([])
 const [error,setError]=useState('')
 useEffect(()=>{
  let active=true
  fetch('/api/integrations').then(async r=>{
   if(!r.ok)throw Error('Could not load MCP tool metadata.')
   return r.json()
  }).then(data=>{if(active)setServices((data.services||[]).filter(s=>s.kind==='mcp'&&s.id!=='tinyfish'))})
   .catch(e=>{if(active)setError(e.message)})
  return ()=>{active=false}
 },[])
 const policies=normalizeMcpPolicies(project.mcpPolicies)
 const change=(id,patch)=>{
  const existing=policies[id]||defaultMcpPolicy()
  onUpdate({mcpPolicies:{...policies,[id]:{...existing,...patch}}})
 }
 const selected=Array.isArray(project.mcp)?project.mcp:[]
 return <section className="projectMcpRisk" aria-label="MCP read and write risk permissions">
  <h4>MCP read/write risk permissions</h4>
  <p className="projectHint">Choose a separate maximum risk level for reading and writing, then allow individual tools. Every permission starts off. These are local preferences, not server grants. Actual MCP execution is disabled.</p>
  {error&&<p role="alert" className="projectAlert">{error}</p>}
  {selected.length===0&&<p className="projectHint">Select an MCP service above to configure its permissions.</p>}
  {selected.map(id=>{
   const setting=policies[id]||defaultMcpPolicy()
   const service=services.find(s=>s.id===id)
   const tools=(service?.tools||[]).filter(t=>typeof t.name==='string')
   return <div key={id} className="projectMcpProvider">
    <strong>{labels[id]||id}</strong>
    <p className="projectHint">{service?.connected?'Connected/discovered':'Not verified or not connected'} · Settings do not enable execution</p>
    <div className="projectMcpModes">{['read','write'].map(mode=><div className="projectMcpMode" key={mode}>
     <label><input type="checkbox" checked={setting[mode].enabled} onChange={e=>change(id,{[mode]:{...setting[mode],enabled:e.target.checked}})}/>{title(mode)} access</label>
     <label className="projectMcpTierLabel">Max risk
      <select aria-label={labels[id]+' '+mode+' maximum risk'} value={setting[mode].maxRisk} disabled={!setting[mode].enabled} onChange={e=>change(id,{[mode]:{...setting[mode],maxRisk:e.target.value}})}>
      {MCP_RISK_TIERS.map(tier=><option key={tier} value={tier}>{title(tier)} Risk</option>)}</select>
     </label>
    </div>)}</div>
    <div className="projectMcpTools">
     {tools.map(tool=>{
      const classification=trustedMcpClassification(id,tool.name)
      const enabled=setting.tools?.[tool.name]===true
      const permitted=classification.reviewed && setting[classification.mode]?.enabled && MCP_RISK_TIERS.indexOf(classification.risk)<=MCP_RISK_TIERS.indexOf(setting[classification.mode].maxRisk)
      return <label key={tool.name} className="projectMcpTool">
       <input type="checkbox" checked={enabled} disabled={!permitted} onChange={e=>change(id,{tools:{...setting.tools,[tool.name]:e.target.checked}})}/>
       <span><strong>{tool.name}</strong><small>{classification.mode.toUpperCase()} · {title(classification.risk)} risk{classification.reviewed?'':' · unreviewed / blocked'}</small></span>
      </label>
     })}
     {!tools.length&&<p className="projectHint">No tools returned yet. Discover this server in MCP connections before granting individual tools.</p>}
    </div>
   </div>
  })}
  <McpApprovalStudio project={project}/>
  <p className="projectHint">Low: allowlisted operations only. Medium: per-operation approval. High: explicit confirmation each action. Critical: separate critical-risk confirmation. Unknown tools always require code-level review; tool-provided descriptions cannot lower risk.</p>
 </section>
}
