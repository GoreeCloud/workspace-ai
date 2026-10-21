// Local sign-in relay: ID tokens are never sent to the browser or stored in sync files.
import {readProfile} from './storage.mjs'
import {createHash} from 'node:crypto'
export function validateSyncGatewayURL(input){
 if(typeof input!=='string'||!input)return null
 try{
  const url=new URL(input)
  if(url.protocol!=='https:'||url.username||url.password||url.hash||url.search||url.port||url.pathname!=='/'||
    url.hostname==='localhost'||/^\d+\.\d+\.\d+\.\d+$/.test(url.hostname))return null
  return url.origin
 }catch{return null}
}
export function attachAccountSyncRelay(app,origins,{gateway=validateSyncGatewayURL(process.env.WORKSPACE_SYNC_GATEWAY_URL),profile=readProfile,fetcher=fetch}={}){
 const status=async()=>{
  const p=await profile()
  return {available:!!gateway,authenticated:!!(p.account?.subject&&p.account?.id_token),email:p.account?.email||null,
   accountId:p.account?.subject?createHash('sha256').update(p.account.subject).digest('hex').slice(0,24):null,
   mode:gateway?'available':'local-only',encryption:'passphrase-required'}
 }
 app.get('/api/sync/status',async(_req,res)=>{try{res.json(await status())}catch{res.status(503).json({error:'Account state unavailable'})}})
 async function proxy(req,res){
  if(!origins.has(req.headers.origin))return res.status(403).json({error:'Local application origin required'})
  if(!gateway)return res.status(503).json({error:'No shared account sync gateway configured. Data remains local on this device.'})
  let p
  try{p=await profile()}catch{return res.status(503).json({error:'Account unavailable'})}
  if(!p.account?.subject||!p.account?.id_token)return res.status(401).json({error:'Sign in to enable account sync'})
  if(req.method==='PUT'){
   const body=JSON.stringify(req.body)
   if(Buffer.byteLength(body)>16*1024*1024)return res.status(413).json({error:'Encrypted snapshot exceeds sync limit'})
  }
  try{
   const response=await fetcher(gateway+'/v1/snapshot',{method:req.method,headers:{
    Authorization:'Bearer '+p.account.id_token,...(req.method==='PUT'?{'Content-Type':'application/json'}:{})
   },...(req.method==='PUT'?{body:JSON.stringify(req.body)}:{}),redirect:'error',signal:AbortSignal.timeout(18000)})
   const size=Number(response.headers.get('content-length'))
   if(Number.isFinite(size)&&size>17*1024*1024)throw Error('Response too large')
   const raw=await response.text()
   if(Buffer.byteLength(raw)>17*1024*1024)throw Error('Response too large')
   const data=JSON.parse(raw)
   res.status(response.status).json(data)
  }catch{return res.status(502).json({error:'Shared sync gateway unavailable or refused the request'})}
 }
 app.get('/api/sync/snapshot',proxy)
 app.put('/api/sync/snapshot',proxy)
 return {status}
}
