// Workspace AI remote CLI and Chrome MCP routes. All operations are initiated
// by an authenticated local operator and require one-time approval.
import {createOperationsBroker,loadRemoteConfig} from './remote-operations-core.mjs'
import {createChromeLocalClient,chromeExecutablePath,REVIEWED_CHROME_TOOLS} from './chrome-mcp-local.mjs'
import {proposeRemoteOperation} from './remote-operations-planner.mjs'

export function attachRemoteOperationsRoutes(app,origins,{readProfile,activeAccountId,getOpenaiKey=()=>'',env=process.env,runSsh,chromeClient}={}){
 const enabled=env.WORKSPACE_REMOTE_OPS_ENABLE==='true'
 const writesEnabled=env.WORKSPACE_REMOTE_OPS_ENABLE_WRITES==='true'
 const browserEnabled=env.WORKSPACE_CHROME_MCP_ENABLE==='true'
 const chromeConfigured=browserEnabled&&Boolean(chromeExecutablePath(env.WORKSPACE_CHROME_MCP_EXECUTABLE))
 const client=chromeConfigured?(chromeClient||createChromeLocalClient({executable:chromeExecutablePath(env.WORKSPACE_CHROME_MCP_EXECUTABLE)})):null
 const hosts=(env.WORKSPACE_CHROME_MCP_ALLOWED_HOSTS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean)
 let config={devices:[]},configError=false
 try{config=loadRemoteConfig(env.WORKSPACE_REMOTE_OPS_CONFIG||'')}catch{configError=true}
 const broker=createOperationsBroker({
  ownerKey:env.WORKSPACE_REMOTE_OPS_OWNER_KEY||'',config,
  enabled:enabled&&!configError,writesEnabled,chromeReady:chromeConfigured,
  browserTools:REVIEWED_CHROME_TOOLS,allowedHosts:hosts,
  ...(runSsh?{runSsh}:{}),
  runBrowser:(name,args)=>client.call(name,args)
 })
 async function endpoint(req,res,fn){
  if(!origins.has(req.headers.origin))return res.status(403).json({error:'Untrusted local origin.'})
  try{
   broker.authenticate(req.headers.authorization)
   const profile=await readProfile()
   if((req.headers['x-workspace-account-id']||null)!==activeAccountId(profile))return res.status(409).json({error:'Account changed; reload Workspace AI.'})
   const result=await fn(req.body||{})
   res.json(result)
  }catch(error){
   const status=[400,401,403,409,413,429,502,503,504].includes(error?.status)?error.status:503
   res.status(status).json({error:status===503?'Remote Operations is not configured or unavailable.':String(error.message||'Remote operation failed.').slice(0,180)})
  }
 }
 app.post('/api/remote/catalog',(req,res)=>endpoint(req,res,()=>({...broker.list(),configurationError:configError})))
 app.post('/api/remote/plan',(req,res)=>endpoint(req,res,body=>proposeRemoteOperation({task:body.task,catalog:broker.list(),key:getOpenaiKey()})))
 app.post('/api/remote/stage',(req,res)=>endpoint(req,res,body=>broker.stage(body)))
 app.post('/api/remote/approve',(req,res)=>endpoint(req,res,body=>broker.approve(body)))
 app.post('/api/remote/execute',(req,res)=>endpoint(req,res,body=>broker.execute(body)))
 app.post('/api/remote/revoke',(req,res)=>endpoint(req,res,()=>broker.revoke()))
 app.post('/api/remote/audit',(req,res)=>endpoint(req,res,()=>({events:broker.history()})))
 return {close:()=>client?.close(),enabled:broker.list().enabled}
}
