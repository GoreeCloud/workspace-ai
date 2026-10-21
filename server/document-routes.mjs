// Owner-local, stateless file transformations. No uploads are persisted on the server.
import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'
const worker=fileURLToPath(new URL('./document_worker.py',import.meta.url))
const fileNames=/^[A-Za-z0-9][A-Za-z0-9 _.()\-]{0,100}\.(docx|pptx|xlsx|pdf)$/i
export async function runDocumentWorker(payload,{python=process.env.WORKSPACE_DOCUMENT_PYTHON||'python3',timeoutMs=15000}={}){
 if(!payload||!['open','edit','create'].includes(payload.action)||!fileNames.test(payload.name||''))
  throw Object.assign(Error('Unsupported document request.'),{status:400})
 if(payload.action!=='create'){
  const data=payload.base64
  if(typeof data!=='string'||data.length>8_388_616||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data))
   throw Object.assign(Error('Invalid or oversized file data.'),{status:400})
 }
 if(payload.action==='edit'&&(!Array.isArray(payload.changes)||payload.changes.length<1||payload.changes.length>120))
  throw Object.assign(Error('Provide 1–120 edits.'),{status:400})
 return await new Promise((resolve,reject)=>{
  const child=spawn(python,['-I','-B',worker],{
   cwd:process.cwd(),stdio:['pipe','pipe','pipe'],
   env:{PATH:process.env.PATH||'',PYTHONIOENCODING:'utf-8',PYTHONDONTWRITEBYTECODE:'1'},windowsHide:true
  })
  let stdout='',stderr='',settled=false
  const rejectOnce=error=>{if(settled)return;settled=true;reject(error)}
  const timer=setTimeout(()=>{child.kill('SIGKILL');rejectOnce(Object.assign(Error('Document conversion timed out.'),{status:503}))},timeoutMs)
  child.on('error',()=>{clearTimeout(timer);rejectOnce(Object.assign(Error('Document converter is unavailable.'),{status:503}))})
  child.stdout.on('data',chunk=>{
   stdout+=chunk.toString('utf8')
   if(stdout.length>9_000_000){child.kill('SIGKILL');rejectOnce(Object.assign(Error('Document output exceeds safety limit.'),{status:413}))}
  })
  child.stderr.on('data',chunk=>{if(stderr.length<1200)stderr+=chunk.toString('utf8').slice(0,1200)})
  child.on('close',code=>{
   clearTimeout(timer)
   if(settled)return
   if(code!==0)return rejectOnce(Object.assign(Error('Document converter failed or dependencies are missing.'),{status:503}))
   let result
   try{result=JSON.parse(stdout)}catch{return rejectOnce(Object.assign(Error('Invalid converter response.'),{status:502}))}
   if(result.ok!==true)return rejectOnce(Object.assign(Error(String(result.error||'Document operation failed.').slice(0,220)),{status:422}))
   settled=true;resolve(result)
  })
  child.stdin.on('error',()=>{})
  child.stdin.end(JSON.stringify(payload))
 })
}
export function attachDocumentRoutes(app,allowedOrigins,{convert=runDocumentWorker}={}){
 let active=0
 app.post('/api/documents/operate',async(req,res)=>{
  if(!allowedOrigins.has(req.headers.origin))return res.status(403).json({error:'Origin not allowed.'})
  res.setHeader('Cache-Control','no-store')
  res.setHeader('Content-Security-Policy',"default-src 'none'")
  if(active>=2)return res.status(429).json({error:"Document converter is busy."})
  active++
  try{
   const result=await convert(req.body)
   res.json(result)
  }catch(error){
   res.status(error.status||500).json({error:error.message||'Document operation failed.'})
  }finally{active--}
 })
}
