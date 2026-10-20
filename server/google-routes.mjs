// Origin-gated, local, standalone Google OAuth and read routes.
import {makeGoogleOAuthSession} from './google-oauth-session.mjs'
import {searchGmail,listDriveFiles,readDriveTextFile} from './google-reader.mjs'
const safeError=(e)=>({code:Number.isInteger(e?.status)&&e.status>=400&&e.status<=599?e.status:503,
 message:e?.status&&typeof e.message==='string'?e.message:'Google integration unavailable.'})
export function attachGoogleRoutes(app,origins,{
 clientId=process.env.WORKSPACE_GOOGLE_CLIENT_ID||'',clientSecret=process.env.WORKSPACE_GOOGLE_CLIENT_SECRET||'',
 port=Number(process.env.WORKSPACE_AI_PORT||3031),fetcher=fetch,
 session=null,readGmail=searchGmail,readDrive=listDriveFiles,readFile=readDriveTextFile
}={}){
 const origin='http://127.0.0.1:'+port
 const auth=session||makeGoogleOAuthSession({clientId,clientSecret,redirectUri:origin+'/api/google/callback',fetcher})
 const allowed=(req,res)=>{
  const allowReadWithoutOrigin=req.method==='GET'&&!req.headers.origin
  if((!allowReadWithoutOrigin&&!origins.has(req.headers.origin))||req.headers['sec-fetch-site']==='cross-site'){
   res.status(403).json({error:'Origin not allowed.'});return false
  }
  return true
 }
 const handle=(service,fn)=>async(req,res)=>{
  if(!allowed(req,res))return
  const token=auth.getToken(service)
  if(!token)return res.status(409).json({error:'Connect the authorized GoreeCloud '+service+' account first.'})
  const revision=auth.activeRevision(service)
  try{
   const data=await fn(token,req)
   if(auth.activeRevision(service)!==revision||auth.getToken(service)!==token)
    return res.status(409).json({error:'Google connection changed during the read.'})
   return res.json(data)
  }catch(e){
   if(auth.activeRevision(service)!==revision)return res.status(409).json({error:'Google connection changed during the read.'})
   if(e.status===401)auth.invalidate(service)
   const x=safeError(e);return res.status(x.code).json({error:x.message})
  }
 }
 app.get('/api/google/status',(_req,res)=>res.json({configured:auth.configured,
  services:auth.status(),readOnly:true,workflowWritesEnabled:false}))
 app.post('/api/google/start',(req,res)=>{
  if(!allowed(req,res))return
  try{return res.json({url:auth.start(req.body?.service)})}
  catch(e){const x=safeError(e);return res.status(x.code).json({error:x.message})}
 })
 app.get('/api/google/callback',async(req,res)=>{
  try{
   await auth.finish({state:req.query?.state,code:req.query?.code,error:req.query?.error})
   return res.redirect(303,origin+'/?google=connected')
  }catch{
   return res.redirect(303,origin+'/?google=failed')
  }
 })
 app.post('/api/google/disconnect',(req,res)=>{
  if(!allowed(req,res))return
  if(!['gmail','google-drive'].includes(req.body?.service))return res.status(400).json({error:'Unknown service.'})
  auth.invalidate(req.body.service)
  return res.json({connected:false,remoteRevocationConfirmed:false,
   warning:'Local session cleared. Revoke this app in Google Account permissions to revoke Google access remotely.'})
 })
 app.post('/api/google/gmail/search',handle('gmail',(token,req)=>readGmail(token,{q:req.body?.q},fetcher)))
 app.get('/api/google/drive/list',handle('google-drive',token=>readDrive(token,{},fetcher)))
 app.post('/api/google/drive/read',handle('google-drive',(token,req)=>readFile(token,{id:req.body?.id},fetcher)))
 return auth
}
