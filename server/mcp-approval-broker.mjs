// In-memory, fail-closed authorization and action-approval broker.
// IMPORTANT: Approving a request never invokes an MCP tool; there is no executor.
import {createHash,randomUUID,timingSafeEqual} from 'node:crypto'
import {assessMcpConfiguredGrant,normalizeMcpPolicies,MCP_PROVIDERS,trustedMcpClassification} from '../src/mcp-risk-policy.js'

const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)
const validId=s=>typeof s==='string'&&/^[a-zA-Z0-9_-]{1,120}$/.test(s)
const hash=x=>createHash('sha256').update(x).digest('hex')
const tokenDigest=secret=>createHash('sha256').update(secret).digest()
function jsonInput(args) {
 if(!record(args))throw Error('Tool arguments must be a JSON object.')
 let data
 try{data=JSON.stringify(args)}catch{throw Error('Invalid tool arguments.')}
 if(!data||Buffer.byteLength(data,'utf8')>8192)throw Error('Tool arguments exceed 8 KB.')
 const parsed=JSON.parse(data)
 // Round-trip to strip object prototypes and disallow unserializable content.
 if(!record(parsed))throw Error('Invalid tool arguments.')
 return data
}
const safePolicy=(input,id)=>{
 if(!validId(id)||!record(input)||!Array.isArray(input.mcp))throw Error('Invalid server policy.')
 const providers=[...new Set(input.mcp)].filter(v=>MCP_PROVIDERS.includes(v))
 if(providers.length!==input.mcp.length)throw Error('Unknown or duplicate MCP provider.')
 const policies=normalizeMcpPolicies(input.mcpPolicies)
 return {id,mcp:providers,mcpPolicies:Object.fromEntries(Object.entries(policies).filter(([name])=>providers.includes(name)))}
}
export function createMcpApprovalBroker({ownerSecret='',now=Date.now,ttlMs=300000}={}){
 const configured=typeof ownerSecret==='string'&&ownerSecret.length>=32
 const secretHash=configured?tokenDigest(ownerSecret):null
 const policies=new Map(),pending=new Map(),audit=[]
 const log=(event,request,detail='')=>{
  audit.push({event,time:now(),projectId:request?.projectId||'',provider:request?.provider||'',toolName:request?.toolName||'',risk:request?.risk||'',detail:String(detail).slice(0,90)})
  if(audit.length>120)audit.splice(0,audit.length-120)
 }
 const ownerAuthorized=header=>{
  if(!configured||typeof header!=='string'||!header.startsWith('Bearer '))return false
  const key=header.slice(7)
  if(key.length<32||key.length>2048)return false
  return timingSafeEqual(secretHash,tokenDigest(key))
 }
 const authenticate=header=>{
  if(!configured)throw Object.assign(Error('Owner authorization is not configured.'),{status:503})
  if(!ownerAuthorized(header))throw Object.assign(Error('Owner authorization required.'),{status:401})
 }
 const prune=()=>{
  for(const [id,p] of pending)if(p.expiresAt<=now()){pending.delete(id);log('expired',p)}
 }
 const invalidate=(predicate,detail)=>{
  for(const [id,p] of pending)if(predicate(p)){pending.delete(id);log('revoked',p,detail)}
 }
 const savePolicy=(projectId,value)=>{
  const project=safePolicy(value,projectId)
  policies.set(projectId,{project,revision:(policies.get(projectId)?.revision||0)+1,expiresAt:now()+15*60_000})
  invalidate(p=>p.projectId===projectId,'Policy changed')
  log('policy-updated',{projectId},'Time-limited owner grant')
  return {projectId,providers:project.mcp,expiresAt:policies.get(projectId).expiresAt}
 }
 const revokeProject=id=>{
  if(!validId(id))throw Error('Invalid project ID.')
  const existed=policies.delete(id)
  invalidate(p=>p.projectId===id,'Project revoked')
  log('project-revoked',{projectId:id})
  return existed
 }
 const revokeProvider=provider=>{
  if(!MCP_PROVIDERS.includes(provider))return
  invalidate(p=>p.provider===provider,'Provider changed or disconnected')
  for(const [id,item] of policies){
   if(item.project.mcp.includes(provider)){
    item.revision++
    item.project.mcp=item.project.mcp.filter(x=>x!==provider)
    delete item.project.mcpPolicies[provider]
    log('provider-revoked',{projectId:id,provider})
   }
  }
 }
 const get=projectId=>{
  const item=policies.get(projectId)
  if(!item)return null
  if(item.expiresAt<=now()){revokeProject(projectId);return null}
  return item
 }
 const check=({projectId,provider,toolName})=>{
  const entry=get(projectId)
  if(!entry)throw Error('Active server-side project grant required.')
  const decision=assessMcpConfiguredGrant({project:entry.project,provider,toolName})
  if(!decision.allowed)throw Error('Risk policy denied: '+decision.reason)
  return {entry,classification:trustedMcpClassification(provider,toolName)}
 }
 const stage=({projectId,provider,toolName,args})=>{
  prune()
  if(pending.size>=32)throw Error('Too many pending approvals.')
  if(!validId(projectId))throw Error('Invalid project ID.')
  const {entry,classification}=check({projectId,provider,toolName})
  const payload=jsonInput(args)
  const id=randomUUID(),expiresAt=now()+Math.min(ttlMs,300000)
  const digest=hash(JSON.stringify({id,projectId,provider,toolName,payload,revision:entry.revision,expiresAt}))
  const proposal={id,projectId,provider,toolName,payload,digest,revision:entry.revision,expiresAt,risk:classification.risk,mode:classification.mode,approved:false}
  pending.set(id,proposal);log('staged',proposal)
  return {id,projectId,provider,toolName,digest,expiresAt,mode:proposal.mode,risk:proposal.risk,approvalRequired:proposal.risk!=='low',criticalConfirmationRequired:proposal.risk==='critical',executionEnabled:false}
 }
 const lookup=(id,digest)=>{
  prune()
  const p=pending.get(id)
  if(!p||typeof digest!=='string'||digest.length!==64||digest!==p.digest)throw Error('Unknown, expired or mismatched approval.')
  const entry=get(p.projectId)
  if(!entry||entry.revision!==p.revision){pending.delete(id);log('revoked',p,'Policy expired or changed');throw Error('Project authorization changed.')}
  check(p)
  return p
 }
 const approve=({id,digest,confirmation='',criticalConfirmation=''})=>{
  const p=lookup(id,digest)
  if(p.risk!=='low'&&confirmation!=='APPROVE')throw Error('This operation requires explicit approval.')
  if(p.risk==='critical'&&criticalConfirmation!=='CONFIRM CRITICAL')throw Error('Separate critical confirmation required.')
  p.approved=true;log('approved',p)
  return {id:p.id,approved:true,expiresAt:p.expiresAt,executionEnabled:false}
 }
 const consume=({id,digest})=>{
  const p=lookup(id,digest)
  if(p.risk!=='low'&&!p.approved)throw Error('Operation has not been approved.')
  pending.delete(id);log('dry-run-consumed',p)
  return {id:p.id,projectId:p.projectId,provider:p.provider,toolName:p.toolName,risk:p.risk,policyValidated:true,providerAuthorizationVerified:false,executed:false,reason:'Only project policy was validated. Provider execution remains disabled.'}
 }
 const peekLive=({id,digest})=>{
  const p=lookup(id,digest)
  if(p.risk!=='low'&&!p.approved)throw Error('Operation has not been approved.')
  return {id:p.id,projectId:p.projectId,provider:p.provider,toolName:p.toolName,mode:p.mode,risk:p.risk,args:JSON.parse(p.payload)}
 }
 const claimLive=({id,digest})=>{
  const p=lookup(id,digest)
  if(p.risk!=='low'&&!p.approved)throw Error('Operation has not been approved.')
  pending.delete(id);log('execution-claimed',p)
  return {id:p.id,projectId:p.projectId,provider:p.provider,toolName:p.toolName,mode:p.mode,risk:p.risk,revision:p.revision,args:JSON.parse(p.payload)}
 }
 const isClaimValid=claim=>{
  try{
   const item=get(claim.projectId)
   if(!item||item.revision!==claim.revision)return false
   return check(claim).classification.risk===claim.risk
  }catch{return false}
 }
 const auditExecution=(event,claim)=>{
  if(!['executed','execution-failed'].includes(event))throw Error('Invalid execution audit event.')
  log(event,claim)
 }
 const status=()=>({ownerConfigured:configured,executionEnabled:false,pending:pending.size})
 return {configured,authenticate,savePolicy,revokeProject,revokeProvider,stage,approve,consume,peekLive,claimLive,isClaimValid,auditExecution,status,history:()=>audit.map(x=>({...x}))}
}
