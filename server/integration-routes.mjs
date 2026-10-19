import {SERVICES,byId} from './services.mjs'
import {serviceTools} from './service-capabilities.mjs'
import {checkProviderToken,TOKEN_PROVIDERS} from './service-validation.mjs'
const envKey=id=>'WORKSPACE_MCP_'+id.toUpperCase().replace(/-/g,'_')+'_URL'
const tokenKey=id=>'WORKSPACE_MCP_'+id.toUpperCase().replace(/-/g,'_')+'_TOKEN'
const endpoint=id=>{
 const raw=process.env[envKey(id)];if(!raw)return null
 try{const x=new URL(raw);if(x.protocol!=='https:'||x.username||x.password||x.hash||x.port||x.hostname==='localhost'||/^\d+\.\d+\.\d+\.\d+$/.test(x.hostname))return null;return x.toString()}catch{return null}
}
async function parseMcp(response){
 const data=(await response.text()).slice(0,500000)
 if(data.startsWith('{'))return JSON.parse(data)
 for(const part of data.split(/\r?\n\r?\n/)){
  const line=part.split(/\r?\n/).find(l=>l.startsWith('data:'))
  if(line){try{const record=JSON.parse(line.slice(5).trim());if(record.jsonrpc==='2.0')return record}catch{}}
 }
 throw Error('Unsupported MCP response')
}
export async function discoverMcp(id,fetchImpl=fetch){
 const url=endpoint(id);if(!url)return {status:'setup-required',message:'Configure an HTTPS MCP endpoint in the local server environment.',tools:[]}
 const headers={'Content-Type':'application/json',Accept:'application/json, text/event-stream','MCP-Protocol-Version':'2025-06-18'}
 if(process.env[tokenKey(id)])headers.Authorization='Bearer '+process.env[tokenKey(id)]
 const call=async(data,session)=>{
  const response=await fetchImpl(url,{method:'POST',headers:{...headers,...(session?{'Mcp-Session-Id':session}:{})},body:JSON.stringify(data),signal:AbortSignal.timeout(12000),redirect:'error'})
  if(!response.ok)throw Error('MCP HTTP '+response.status)
  return {payload:await parseMcp(response),session:response.headers.get('mcp-session-id')||session}
 }
 try{
  const init=await call({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'GoreeCloud Workspace AI',version:'0.2.0'}}})
  if(init.payload.error)throw Error('Initialize failed')
  const list=await call({jsonrpc:'2.0',id:2,method:'tools/list',params:{}},init.session)
  if(list.payload.error)throw Error('Tool listing failed')
  const tools=(list.payload.result?.tools||[]).filter(t=>typeof t?.name==='string').slice(0,120).map(t=>({name:t.name.slice(0,120),description:String(t.description||'').slice(0,240),executable:false,requiresApproval:true}))
  return {status:'connected',message:'MCP tools discovered. Execution remains disabled pending approvals.',tools}
 }catch{return {status:'unavailable',message:'MCP discovery failed; check server authorization and transport.',tools:[]}}
}
export function attachIntegrationRoutes(app,origins){
 const tokens=new Map(),states=new Map(),discovered=new Map()
 const allow=(req,res)=>{if(origins.has(req.headers.origin))return true;res.status(403).json({error:'Origin not allowed.'});return false}
 const record=s=>({...s,authConfigured:!!(s.kind==='mcp'&&endpoint(s.id)),connected:states.get(s.id)?.status==='connected',status:states.get(s.id)?.status||(s.kind==='mcp'&&endpoint(s.id)?'ready-for-discovery':'setup-required'),message:states.get(s.id)?.message||'Requires its own authorized connection.',tools:discovered.get(s.id)||serviceTools(s.id)})
 app.get('/api/integrations',(_req,res)=>res.json({services:SERVICES.map(record),executionEnabled:false}))
 app.get('/api/integrations/:id/tools',(req,res)=>{const s=byId(req.params.id);if(!s)return res.status(404).json({error:'Unknown service.'});res.json({service:s.id,tools:record(s).tools,executionEnabled:false})})
 app.post('/api/integrations/:id/connect',async(req,res)=>{
  if(!allow(req,res))return
  const s=byId(req.params.id);if(!s)return res.status(404).json({error:'Unknown service.'})
  if(!TOKEN_PROVIDERS[s.id])return res.status(409).json({error:'OAuth or administrator-approved MCP configuration required.'})
  const token=req.body?.token
  if(typeof token!=='string'||token.length>2048)return res.status(400).json({error:'Invalid token.'})
  const result=await checkProviderToken(s.id,token)
  if(result.status==='connected'){tokens.set(s.id,token.trim());states.set(s.id,result)}
  res.json({service:s.id,...result,connected:result.status==='connected'})
 })
 app.post('/api/integrations/:id/discover',async(req,res)=>{
  if(!allow(req,res))return
  const s=byId(req.params.id);if(!s)return res.status(404).json({error:'Unknown service.'})
  if(s.kind!=='mcp')return res.status(409).json({error:'Not an MCP provider.'})
  const result=await discoverMcp(s.id);states.set(s.id,{status:result.status,message:result.message})
  if(result.status==='connected')discovered.set(s.id,result.tools);else discovered.delete(s.id)
  res.json({...result,service:s.id,executionEnabled:false})
 })
 app.post('/api/integrations/:id/disconnect',(req,res)=>{
  if(!allow(req,res))return
  const s=byId(req.params.id);if(!s)return res.status(404).json({error:'Unknown service.'})
  tokens.delete(s.id);states.delete(s.id);discovered.delete(s.id)
  res.json({service:s.id,connected:false,status:'setup-required'})
 })
}
