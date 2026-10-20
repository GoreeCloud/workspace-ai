// Bounded, recursive Dropbox read-only folder snapshot (not a background sync worker).
import {DropboxReadError} from './dropbox-reader.mjs'
import {readDropboxText,validateDropboxTextPath,MAX_DROPBOX_TEXT_BYTES} from './dropbox-text.mjs'

const LIMIT_ENTRIES=200, LIMIT_FILES=10, LIMIT_PAGES=4
export function validateLinkedDropboxFolder(path){
 if(typeof path!=='string'||!path.startsWith('/')||path.length>1024||
  /[\x00-\x1f\x7f\\]/.test(path)||path.endsWith('/')||
  path.split('/').slice(1).some(s=>!s||s==='.'||s==='..'||s.length>150))
  throw new DropboxReadError(400,'Invalid Dropbox folder path.')
 return path
}
const validChild=(root,path)=>{
 if(typeof path!=='string'||path.length>1024||!path.toLowerCase().startsWith(root.toLowerCase()+'/'))return false
 const relative=path.slice(root.length+1)
 const parts=relative.split('/')
 return !!relative&&parts.length<=4&&parts.every(p=>p.length>0&&p.length<=110&&p!=='.'&&p!=='..'&&!p.startsWith('.')&&!/[\x00-\x1f\x7f\\]/.test(p))&&relative.length<=110
}
async function jsonBounded(response,maxBytes=230000){
 const size=Number(response.headers?.get?.('content-length'))
 if(Number.isFinite(size)&&size>maxBytes)throw new DropboxReadError(413,'Dropbox folder listing exceeds safety limits.')
 let raw
 if(response.body&&typeof response.body.getReader==='function'){
  const reader=response.body.getReader(),chunks=[];let received=0
  try{
   for(;;){
    const {done,value}=await reader.read();if(done)break
    received+=value.byteLength
    if(received>maxBytes)throw new DropboxReadError(413,'Dropbox folder listing exceeds safety limits.')
    chunks.push(Buffer.from(value))
   }
  }finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
  raw=Buffer.concat(chunks).toString('utf8')
 }else{
  raw=await response.text()
  if(Buffer.byteLength(raw)>maxBytes)throw new DropboxReadError(413,'Dropbox folder listing exceeds safety limits.')
 }
 try{return JSON.parse(raw)}catch{throw new DropboxReadError(502,'Dropbox folder listing is unreadable.')}
}
export async function readDropboxLinkedFolder(token,{path}={},fetchImpl=fetch,readText=readDropboxText){
 const root=validateLinkedDropboxFolder(path)
 if(typeof token!=='string'||!token||token.length>2048||/\s/.test(token))
  throw new DropboxReadError(409,'Connect Dropbox before linking a folder.')
 const files=[];let cursor=null,visited=0
 const knownCursors=new Set()
 for(let page=0;page<LIMIT_PAGES;page++){
  const responseUrl='https://api.dropboxapi.com/2/files/list_folder'+(cursor?'/continue':'')
  const requestBody=cursor?{cursor}:{path:root,recursive:true,include_deleted:false,limit:100}
  let response
  try{response=await fetchImpl(responseUrl,{
   method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),
   headers:{Authorization:'Bearer '+token,Accept:'application/json','Content-Type':'application/json'},
   body:JSON.stringify(requestBody)
  })}catch{throw new DropboxReadError(503,'Dropbox folder listing unavailable.')}
  if(!response.ok){
   if(response.status===401)throw new DropboxReadError(401,'Dropbox rejected this credential.')
   if(response.status===403)throw new DropboxReadError(403,'Dropbox folder-read permission is required.')
   if(response.status===409)throw new DropboxReadError(409,'Dropbox folder is missing or unavailable.')
   throw new DropboxReadError(503,'Dropbox could not list this folder.')
  }
  const listing=await jsonBounded(response)
  if(!Array.isArray(listing?.entries)||listing.entries.length>100||typeof listing.has_more!=='boolean')
   throw new DropboxReadError(502,'Dropbox folder listing is invalid.')
  visited+=listing.entries.length
  if(visited>LIMIT_ENTRIES)throw new DropboxReadError(413,'Dropbox folder contains too many entries.')
  for(const entry of listing.entries){
   if(entry?.['.tag']!=='file')continue
   const itemPath=entry.path_display
   if(!validChild(root,itemPath))continue
   if(!Number.isSafeInteger(entry.size)||entry.size<0||entry.size>MAX_DROPBOX_TEXT_BYTES)continue
   try{validateDropboxTextPath(itemPath)}catch{continue}
   if(files.some(f=>f.path.toLowerCase()===itemPath.toLowerCase()))throw new DropboxReadError(502,'Dropbox returned duplicate file paths.')
   files.push({path:itemPath,relativePath:itemPath.slice(root.length+1)})
   if(files.length>LIMIT_FILES)throw new DropboxReadError(413,'Dropbox folder has more than ten supported text files.')
  }
  if(!listing.has_more){cursor=null;break}
  if(typeof listing.cursor!=='string'||listing.cursor.length<1||listing.cursor.length>2048||/[\x00-\x1f\x7f]/.test(listing.cursor)||knownCursors.has(listing.cursor))
   throw new DropboxReadError(502,'Dropbox folder cursor is invalid.')
  knownCursors.add(listing.cursor);cursor=listing.cursor
  if(page===LIMIT_PAGES-1)throw new DropboxReadError(413,'Dropbox folder pagination exceeds safety limits.')
 }
 files.sort((a,b)=>a.relativePath.localeCompare(b.relativePath))
 // All-or-nothing: if one approved text read fails, the browser retains the previous snapshot.
 const snapshots=[]
 for(const item of files){
  const downloaded=await readText(token,{path:item.path},fetchImpl)
  if(typeof downloaded.content!=='string'||downloaded.size>MAX_DROPBOX_TEXT_BYTES)
   throw new DropboxReadError(502,'Invalid Dropbox text snapshot.')
  snapshots.push({relativePath:item.relativePath,content:downloaded.content,size:downloaded.size})
 }
 return {path:root,files:snapshots,readOnly:true,fullyScanned:true}
}
