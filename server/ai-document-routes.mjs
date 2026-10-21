import {createHash} from 'node:crypto'
import {runDocumentWorker} from './document-routes.mjs'
const allowed=new Set(['docx','md','pdf'])
const mime={docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',md:'text/markdown; charset=utf-8',pdf:'application/pdf'}
export function validateDocumentRequest(body){
 if(!body||typeof body!=='object'||Array.isArray(body))throw Error('Invalid document request.')
 const {format,title,source}=body
 if(!allowed.has(format))throw Error('Unsupported document format.')
 if(typeof title!=='string'||!title.trim()||title.length>160)throw Error('Invalid document title.')
 if(typeof source!=='string'||source.trim().length<12||source.length>12000||source.includes('\0'))throw Error('Document source must contain 12–12,000 characters.')
 const lines=source.trim().split(/\r?\n/)
 if(lines.length>250||lines.some(line=>line.length>1600))throw Error('Document has too many or oversized lines.')
 const name=(title.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9 -]/g,' ').trim().replace(/\s+/g,'-').slice(0,75)||'Document')+'.'+format
 return {format,title,source:source.trim()+'\n',name}
}
export async function createChatDocument(body,{convert=runDocumentWorker}={}){
 const item=validateDocumentRequest(body)
 const data=item.format==='md'?Buffer.from(item.source,'utf8'):null
 let binary=data
 if(!binary){
  const model=item.format==='docx'?{markdown:item.source}:{text:item.source,markdown:true}
  const result=await convert({action:'create',name:item.name,model})
  binary=Buffer.from(result.base64,'base64')
  const reopened=await convert({action:'open',name:item.name,base64:result.base64})
  if(!reopened.model||(item.format==='docx'&&!reopened.model.paragraphCount)||(item.format==='pdf'&&!reopened.model.pageCount))
   throw Error('Generated document failed validation.')
  const heading=item.source.split('\n').find(line=>line.startsWith('# '))?.slice(2).trim()
  if(heading&&heading.length>=4&&heading.length<=120&&/^[ -~]+$/.test(heading)){
   const lines=item.format==='docx'?reopened.model.paragraphs:reopened.model.pages
   const extracted=(lines||[]).map(p=>p.text||'').join(' ').replace(/\s+/g,' ').toLowerCase()
   if(!extracted.includes(heading.replace(/\s+/g,' ').toLowerCase()))
    throw Error('Generated document did not retain its opening title.')
  }

 }
 if(binary.length<12||binary.length>6*1024*1024)throw Error('Document file size is invalid.')
 return {ok:true,name:item.name,format:item.format,mime:mime[item.format],bytes:binary.length,
  sha256:createHash('sha256').update(binary).digest('hex'),base64:binary.toString('base64')}
}

export function attachChatDocumentRoutes(app,origins,{render=createChatDocument}={}){
 let active=0
 app.post('/api/documents/from-chat',async(req,res)=>{
  if(!origins.has(req.headers.origin))return res.status(403).json({error:'Origin not allowed.'})
  res.setHeader('Cache-Control','no-store')
  res.setHeader('Content-Security-Policy',"default-src 'none'")
  if(active>=2)return res.status(429).json({error:'Document generation is busy. Please retry.'})
  try{validateDocumentRequest(req.body)}catch(e){return res.status(400).json({error:e.message})}
  active++
  try{res.json(await render(req.body))}
  catch(e){res.status(e.status||422).json({error:String(e.message||'Document generation failed.').slice(0,220)})}
  finally{active--}
 })
}
