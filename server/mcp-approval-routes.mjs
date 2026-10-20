// Owner-only, local-origin MCP authorization previews.
// No route invokes MCP or accepts client claims as server authorization.
import {createMcpApprovalBroker} from './mcp-approval-broker.mjs'

export function attachMcpApprovalRoutes(app,origins,{ownerSecret=process.env.WORKSPACE_MCP_OWNER_KEY||'',now=Date.now}={}){
 const broker=createMcpApprovalBroker({ownerSecret,now})
 const route=fn=>(req,res)=>{
  if(!origins.has(req.headers.origin))return res.status(403).json({error:'Origin not allowed.'})
  try{
   broker.authenticate(req.headers.authorization)
   return fn(req,res)
  }catch(e){return res.status(e.status||401).json({error:e.message})}
 }
 const perform=method=>(req,res)=>{
  try{
   return res.json(method())
  }catch(e){
   return res.status(400).json({error:e.message})
  }
 }
 app.get('/api/mcp-approval/status',(_req,res)=>res.json({ownerConfigured:broker.configured,executionEnabled:false}))
 app.post('/api/mcp-approval/projects/:projectId',route((req,res)=>perform(()=>broker.savePolicy(req.params.projectId,req.body))(req,res)))
 app.post('/api/mcp-approval/projects/:projectId/revoke',route((req,res)=>perform(()=>({revoked:broker.revokeProject(req.params.projectId),executionEnabled:false}))(req,res)))
 app.post('/api/mcp-approval/stage',route((req,res)=>perform(()=>broker.stage(req.body||{}))(req,res)))
 app.post('/api/mcp-approval/approve',route((req,res)=>perform(()=>broker.approve(req.body||{}))(req,res)))
 app.post('/api/mcp-approval/consume-dry-run',route((req,res)=>perform(()=>broker.consume(req.body||{}))(req,res)))
 app.get('/api/mcp-approval/audit',route((req,res)=>res.json({events:broker.history(),executionEnabled:false})))
 return broker
}
