import {SERVICES,byId} from './services.mjs'
import {serviceTools} from './service-capabilities.mjs'
import {checkProviderToken,TOKEN_PROVIDERS} from './service-validation.mjs'
import {readTodoistPage} from './todoist-reader.mjs'
import {attachTodoistReadRoute} from './todoist-routes.mjs'
import {readGitHubPage} from './github-reader.mjs'
import {attachGitHubReadRoute} from './github-routes.mjs'
import {readDropboxFolder} from './dropbox-reader.mjs'
import {attachDropboxReadRoute} from './dropbox-routes.mjs'
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
  // MCP clients must acknowledge initialization before calling tools/list.
  // Notifications normally return HTTP 202 without a JSON-RPC response.
  const notified=await fetchImpl(url,{
   method:'POST',headers:{...headers,...(init.session?{'Mcp-Session-Id':init.session}:{})},
   body:JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'}),
   signal:AbortSignal.timeout(12000),redirect:'error'
  })
  if(!notified.ok)throw Error('MCP initialization notification failed')
  const list=await call({jsonrpc:'2.0',id:2,method:'tools/list',params:{}},init.session)
  if(list.payload.error)throw Error('Tool listing failed')
  const tools=(list.payload.result?.tools||[]).filter(t=>typeof t?.name==='string').slice(0,120).map(t=>({name:t.name.slice(0,120),description:String(t.description||'').slice(0,240),executable:false,requiresApproval:true}))
  return {status:'connected',message:'MCP tools discovered. Execution remains disabled pending approvals.',tools}
 }catch{return {status:'unavailable',message:'MCP discovery failed; check server authorization and transport.',tools:[]}}
}
export function attachIntegrationRoutes(app,origins,{checkToken=checkProviderToken,discover=discoverMcp,readTodoist=readTodoistPage,readGitHub=readGitHubPage,readDropbox=readDropboxFolder}={}){
 const tokens=new Map(),states=new Map(),discovered=new Map(),revisions=new Map()
 const bump=id=>{const value=(revisions.get(id)||0)+1;revisions.set(id,value);return value}
 const allow=(req,res)=>{if(origins.has(req.headers.origin))return true;res.status(403).json({error:'Origin not allowed.'});return false}
 attachTodoistReadRoute(app,{
  origins,getToken:()=>tokens.get('todoist'),getRevision:()=>revisions.get('todoist')||0,
  invalidate:()=>{tokens.delete('todoist');states.set('todoist',{status:'invalid',message:'Todoist rejected this credential.'});bump('todoist')}
 },readTodoist)
 attachGitHubReadRoute(app,{
  origins,getToken:()=>tokens.get('github'),getRevision:()=>revisions.get('github')||0,
  invalidate:()=>{tokens.delete('github');states.set('github',{status:'invalid',message:'GitHub rejected this credential.'});bump('github')}
 },readGitHub)
 attachDropboxReadRoute(app,{
  origins,getToken:()=>tokens.get('dropbox'),getRevision:()=>revisions.get('dropbox')||0,
  invalidate:()=>{tokens.delete('dropbox');states.set('dropbox',{status:'invalid',message:'Dropbox rejected this credential.'});bump('dropbox')}
 },readDropbox)
 const record=s=>({...s,authConfigured:!!(s.kind==='mcp'&&endpoint(s.id)),connected:states.get(s.id)?.status==='connected',hasSessionToken:tokens.has(s.id),status:states.get(s.id)?.status||(s.kind==='mcp'&&endpoint(s.id)?'ready-for-discovery':'setup-required'),message:states.get(s.id)?.message||'Requires its own authorized connection.',tools:discovered.get(s.id)||serviceTools(s.id)})
 app.get('/api/integrations',(_req,res)=>res.json({services:SERVICES.map(record),executionEnabled:false}))
 app.get('/api/integrations/:id/tools',(req,res)=>{const s=byId(req.params.id);if(!s)return res.status(404).json({error:'Unknown service.'});res.json({service:s.id,tools:record(s).tools,executionEnabled:false})})
 app.post('/api/integrations/:id/connect',async(req,res)=>{
  if(!allow(req,res))return
  const s=byId(req.params.id);if(!s)return res.status(404).json({error:'Unknown service.'})
  if(!TOKEN_PROVIDERS[s.id])return res.status(409).json({error:'OAuth or administrator-approved MCP configuration required.'})
  const token=req.body?.token
  if(typeof token!=='string'||token.length>2048)return res.status(400).json({error:'Invalid token.'})
  const revision=bump(s.id)
  tokens.delete(s.id);states.delete(s.id);discovered.delete(s.id)
  const result=await checkToken(s.id,token)
  if(revision!==revisions.get(s.id))return res.status(409).json({error:'Connection changed during verification.'})
  states.set(s.id,result)
  if(result.status==='connected')tokens.set(s.id,token.trim())
  res.json({service:s.id,...result,connected:result.status==='connected'})
 })
 app.post('/api/integrations/:id/verify',async(req,res)=>{
  if(!allow(req,res))return
  const service=byId(req.params.id)
  if(!service)return res.status(404).json({error:'Unknown service.'})
  const token=tokens.get(service.id)
  if(!token)return res.status(409).json({error:'No active session token for this provider.'})
  const revision=revisions.get(service.id)||0
  const result=await checkToken(service.id,token)
  if(revision!==revisions.get(service.id))return res.status(409).json({error:'Connection changed during verification.'})
  states.set(service.id,result)
  if(result.status==='invalid'){tokens.delete(service.id);bump(service.id)}
  res.json({service:service.id,...result,connected:result.status==='connected'})
 })
 app.post('/api/integrations/:id/discover',async(req,res)=>{
  if(!allow(req,res))return
  const s=byId(req.params.id);if(!s)return res.status(404).json({error:'Unknown service.'})
  if(s.kind!=='mcp')return res.status(409).json({error:'Not an MCP provider.'})
  const revision=bump(s.id)
  states.set(s.id,{status:'discovering',message:'Discovering available tools.'});discovered.delete(s.id)
  const result=await discover(s.id)
  if(revision!==revisions.get(s.id))return res.status(409).json({error:'Connection changed during discovery.'})
  const safeTools=(Array.isArray(result.tools)?result.tools:[]).filter(t=>typeof t?.name==='string').slice(0,120).map(t=>({
   name:t.name.slice(0,120),description:String(t.description||'').slice(0,240),executable:false,requiresApproval:true
  }))
  const safeMessage=String(result.message||'').slice(0,300)
  states.set(s.id,{status:result.status,message:safeMessage})
  if(result.status==='connected')discovered.set(s.id,safeTools);else discovered.delete(s.id)
  res.json({status:result.status,message:safeMessage,tools:safeTools,service:s.id,executionEnabled:false})
 })
 app.post('/api/integrations/:id/disconnect',(req,res)=>{
  if(!allow(req,res))return
  const s=byId(req.params.id);if(!s)return res.status(404).json({error:'Unknown service.'})
  bump(s.id)
  tokens.delete(s.id);states.delete(s.id);discovered.delete(s.id)
  res.json({service:s.id,connected:false,status:'setup-required'})
 })
}
