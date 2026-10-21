// Project risk settings are not bearer credentials. The server must independently
// classify, authenticate and approve operations before any future MCP execution.
export const MCP_RISK_TIERS=Object.freeze(['low','medium','high','critical'])
export const MCP_PROVIDERS=Object.freeze(['remote-desktop-commander','firecrawl','todoist-mcp','google-drive-mcp','gmail-mcp','github-mcp','dropbox-mcp','linear-mcp','notion-mcp'])
const index=Object.fromEntries(MCP_RISK_TIERS.map((v,i)=>[v,i]))
const REGISTRY={
 'remote-desktop-commander':{'devices.list':{mode:'read',risk:'low'},'process.execute':{mode:'write',risk:'critical'}},
 firecrawl:{'web.scrape':{mode:'read',risk:'medium'},'web.crawl':{mode:'read',risk:'high'}}
}
const record=v=>!!v&&typeof v==='object'&&!Array.isArray(v)
const tier=v=>MCP_RISK_TIERS.includes(v)?v:'low'
export const defaultMcpPolicy=()=>({read:{enabled:false,maxRisk:'low'},write:{enabled:false,maxRisk:'low'},tools:{}})
export function normalizeMcpPolicies(value){
 if(!record(value))return {}
 const out={}
 for(const provider of MCP_PROVIDERS){
  const input=value[provider]
  if(!record(input))continue
  const tools={}
  if(record(input.tools)){
   for(const [name,allowed] of Object.entries(input.tools).slice(0,120))
    if(name.length>0&&name.length<=120&&allowed===true)tools[name]=true
  }
  out[provider]={
   read:{enabled:input.read?.enabled===true,maxRisk:tier(input.read?.maxRisk)},
   write:{enabled:input.write?.enabled===true,maxRisk:tier(input.write?.maxRisk)},
   tools
  }
 }
 return out
}
// Only source-reviewed, exact tool names can be assigned less than critical risk.
// Untrusted MCP descriptions/annotations must never silently lower a risk class.
export function trustedMcpClassification(provider,toolName){
 const reviewed=REGISTRY[provider]?.[toolName]
 return reviewed?{...reviewed,reviewed:true}:{mode:'write',risk:'critical',reviewed:false}
}
export const MCP_APPROVALS=Object.freeze({
 low:'allow-per-configured-tool',
 medium:'per-operation-approval',
 high:'per-operation-explicit-confirmation',
 critical:'separate-critical-confirmation'
})
export function assessMcpConfiguredGrant({project,provider,toolName}={}){
 if(!MCP_PROVIDERS.includes(provider)||typeof toolName!=='string'||!toolName||toolName.length>120)
  return {allowed:false,reason:'Invalid MCP tool or provider'}
 const classification=trustedMcpClassification(provider,toolName)
 const policy=normalizeMcpPolicies(project?.mcpPolicies)[provider]||defaultMcpPolicy()
 const {mode,risk}=classification
 const result={allowed:false,provider,toolName,mode,risk,reviewed:classification.reviewed,approval:MCP_APPROVALS[risk]}
 if(!Array.isArray(project?.mcp)||!project.mcp.includes(provider))return {...result,reason:'MCP provider not selected'}
 if(!policy[mode]?.enabled)return {...result,reason:mode+' permission disabled'}
 if(index[risk]>index[policy[mode].maxRisk])return {...result,reason:'Risk exceeds '+mode+' ceiling'}
 if(policy.tools[toolName]!==true)return {...result,reason:'Tool is not individually permitted'}
 if(!classification.reviewed)return {...result,reason:'Unknown tool needs trusted server review'}
 return {...result,allowed:true,reason:'Configured project policy permits this tool; this is not an execution grant'}
}
export function assessMcpTool({project,provider,toolName,connected=false,serverAuthorized=false,approved=false,
 criticalConfirmed=false,executionEnabled=false}={}){
 const result=assessMcpConfiguredGrant({project,provider,toolName})
 if(!result.allowed)return result
 if(!connected)return {...result,allowed:false,reason:'Provider connection not verified'}
 if(!executionEnabled)return {...result,allowed:false,reason:'MCP execution disabled'}
 if(!serverAuthorized)return {...result,allowed:false,reason:'Server-held authorization missing'}
 if(result.risk!=='low'&&!approved)return {...result,allowed:false,reason:'Per-operation approval required'}
 if(result.risk==='critical'&&!criticalConfirmed)return {...result,allowed:false,reason:'Separate critical confirmation required'}
 return {...result,allowed:true,reason:'Approved by policy'}
}
