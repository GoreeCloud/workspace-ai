import {DropboxReadError} from './dropbox-reader.mjs'
export const MAX_DROPBOX_TEXT_BYTES=64*1024
const extensions=new Set(['txt','md','markdown','csv','tsv','json','yaml','yml','log','js','jsx','ts','tsx','py','html','css','xml','sql'])
export function validateDropboxTextPath(path){
 if(typeof path!=='string'||!path.startsWith('/')||path.length>1024||path.includes('\\')||path.split('/').slice(1).some(s=>s==='.'||s==='..'||!s||s.length>200))throw new DropboxReadError(400,'Invalid Dropbox path.')
 const name=path.split('/').at(-1)
 if(!name||!extensions.has(name.split('.').at(-1).toLowerCase())||Array.from(path).some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127))throw new DropboxReadError(400,'Only supported text and source files can be imported.')
 return name
}
export async function readDropboxText(token,{path},fetchImpl=fetch){
 const name=validateDropboxTextPath(path)
 if(typeof token!=='string'||!token.trim()||token.length>2048||token.trim()!==token)throw new DropboxReadError(409,'Connect Dropbox first.')
 let response
 try{
  response=await fetchImpl('https://content.dropboxapi.com/2/files/download',{
   method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),
   headers:{Authorization:'Bearer '+token,'Dropbox-API-Arg':JSON.stringify({path})}
  })
 }catch{throw new DropboxReadError(503,'Dropbox text download unavailable.')}
 if(!response.ok){
  if(response.status===401)throw new DropboxReadError(401,'Dropbox rejected this credential.')
  if(response.status===403)throw new DropboxReadError(403,'Dropbox content-read permission is required.')
  if(response.status===409)throw new DropboxReadError(409,'Dropbox file was not found.')
  throw new DropboxReadError(503,'Dropbox could not return this text file.')
 }
 if(Number(response.headers.get('content-length'))>MAX_DROPBOX_TEXT_BYTES)throw new DropboxReadError(413,'Dropbox text file exceeds 64 KB.')
 if(!response.body)throw new DropboxReadError(502,'Dropbox returned no file content.')
 const reader=response.body.getReader()
 let bytes=0
 const parts=[]
 try{
  while(true){
   const {done,value}=await reader.read()
   if(done)break
   bytes+=value.byteLength
   if(bytes>MAX_DROPBOX_TEXT_BYTES)throw new DropboxReadError(413,'Dropbox text file exceeds 64 KB.')
   parts.push(value)
  }
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
 const binary=new Uint8Array(bytes);let at=0
 for(const part of parts){binary.set(part,at);at+=part.byteLength}
 let content
 try{content=new TextDecoder('utf-8',{fatal:true}).decode(binary)}catch{throw new DropboxReadError(415,'Only UTF-8 text files are supported.')}
 if(content.includes(String.fromCharCode(0)))throw new DropboxReadError(415,'Binary files cannot be imported.')
 return {name,content,size:bytes,source:'dropbox'}
}
