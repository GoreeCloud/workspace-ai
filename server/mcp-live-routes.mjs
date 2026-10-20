// Single-operator, opt-in, per-action MCP execution. Never model-initiated.
import {invokeReviewedMcp,validateApprovedMcpArguments} from './mcp-executor.mjs'
import {MCP_PROVIDERS} from '../src/mcp-risk-policy.js'

export function attachMcpLiveRoutes(app,origins,{
 broker,providerReady=()=>false,endpointFor=()=>null,tokenFor=()=>'',
 enabled=process.env.WORKSPACE_MCP_ENABLE_TOOL_CALLS==='true',
 writesEnabled=process.env.WORKSPACE_MCP_ENABLE_WRITES==='true',
 allowCommands=()=> (process.env.WORKSPACE_MCP_ALLOWED_COMMANDS||'').split(';;').filter(Boolean),
 allowHosts=()=> (process.env.WORKSPACE_MCP_ALLOWED_CONTENT_HOSTS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean),
 invoke=invokeReviewedMcp
}={}){
 if(!broker)throw Error('Approval broker is required.')
 const available=()=>Boolean(enabled&&broker.configured)
 app.get('/api/mcp-live/status',(_req,res)=>res.json({executionEnabled:available(),writeExecutionEnabled:available()&&Boolean(writesEnabled)}))
 app.post('/api/mcp-live/execute',async(req,res)=>{
  if(!origins.has(req.headers.origin))return res.status(403).json({error:'Origin not allowed.'})
  try{broker.authenticate(req.headers.authorization)}catch(e){return res.status(e.status||401).json({error:e.message})}
  if(!available())return res.status(409).json({error:'MCP live execution is disabled.'})
  let staged
  try{
   staged=broker.peekLive({id:req.body?.id,digest:req.body?.digest})
   if(!MCP_PROVIDERS.includes(staged.provider))throw Error('Unsupported MCP provider.')
   if(staged.mode==='write'&&!writesEnabled)throw Error('Write execution is disabled.')
   if(!providerReady(staged.provider,staged.toolName))throw Error('Matching verified MCP discovery is required.')
   validateApprovedMcpArguments(staged.provider,staged.toolName,staged.args,{allowCommands:allowCommands(),allowHosts:allowHosts()})
  }catch(e){return res.status(409).json({error:e.message})}
  // Atomically claim before any await or network call. Never restore a failed claim.
  let claim
  try{claim=broker.claimLive({id:req.body?.id,digest:req.body?.digest})}
  catch(e){return res.status(409).json({error:e.message})}
  try{
   const result=await invoke({
    provider:claim.provider,toolName:claim.toolName,args:claim.args,
    endpoint:endpointFor(claim.provider),token:tokenFor(claim.provider),
    allowCommands:allowCommands(),allowHosts:allowHosts(),
    preCall:()=>{
     if(!available()||!providerReady(claim.provider,claim.toolName)||!broker.isClaimValid(claim))
      throw Error('Provider or project grant revoked before tool invocation.')
    }
   })
   broker.auditExecution('executed',claim)
   return res.json({executed:true,id:claim.id,provider:claim.provider,toolName:claim.toolName,risk:claim.risk,result})
  }catch{
   broker.auditExecution('execution-failed',claim)
   return res.status(502).json({executed:false,error:'MCP tool call failed or authorization changed. No remote details are exposed.'})
  }
 })
 return {executionEnabled:available()}
}
