// Read-only local file/directory handles. IndexedDB stores handles; project backups do not.
export const MAX_LINKED_SOURCES=5
export const REFRESH_INTERVAL_MS=60000
const MAX_DIRECTORY_ENTRIES=200
const SUPPORTED_EXTENSIONS=new Set(['txt','md','markdown','csv','tsv','json','yaml','yml','log','js','jsx','ts','tsx','py','html','css','xml','sql'])
export const linkedFileId=(sourceId,path)=>sourceId+':'+path
export function validateLinkedSource(value){
 if(!value||typeof value!=='object'||typeof value.id!=='string'||!/^[a-z0-9-]{1,90}$/i.test(value.id)||
  !['file','directory','dropbox-file'].includes(value.kind)||typeof value.name!=='string'||!value.name.trim()||value.name.length>100)throw Error('Invalid linked source metadata.')
 if(value.kind==='dropbox-file'&&(typeof value.path!=='string'||!value.path.startsWith('/')||value.path.length>1024||value.path.includes(String.fromCharCode(0))))throw Error('Invalid Dropbox source path.')
 return {id:value.id,kind:value.kind,name:value.name.slice(0,100),linkedAt:Number.isFinite(value.linkedAt)?value.linkedAt:0,...(value.kind==='dropbox-file'?{path:value.path}:{})}
}
const validPath=(path)=>typeof path==='string'&&path.length<=110&&!path.includes('..')&&!path.includes('\\')&&!path.includes('\0')
const suitable=(name,size)=>{
 const suffix=name.split('.').pop().toLowerCase()
 return SUPPORTED_EXTENSIONS.has(suffix)&&Number.isSafeInteger(size)&&size>=0&&size<=65536
}
export async function scanSource(handle,source){
 validateLinkedSource(source)
 if(!handle||handle.kind!==source.kind)throw Error('Linked source handle no longer matches.')
 if(typeof handle.queryPermission!=='function'||await handle.queryPermission({mode:'read'})!=='granted')
  throw Error('Source permission is unavailable. Reconnect the source.')
 const result=[];let visited=0
 const read=async(file,path)=>{
  if(!validPath(path))throw Error('Linked source contains an unsupported path.')
  if(++visited>MAX_DIRECTORY_ENTRIES)throw Error('Linked source has too many entries.')
  if(!suitable(path,file.size))return
  if(result.length>=10)throw Error('Too many supported text files in linked source (maximum ten).')
  const bytes=await file.arrayBuffer()
  if(bytes.byteLength>65536)throw Error('Linked file exceeds 64 KB.')
  const content=new TextDecoder('utf-8',{fatal:true}).decode(bytes)
  if(content.includes('\0'))throw Error('Binary content cannot be linked.')
  result.push({id:linkedFileId(source.id,path),name:path,content,source:'linked-local',linkId:source.id,relativePath:path,createdAt:Number.isFinite(file.lastModified)?file.lastModified:0})
 }
 const walk=async(dir,prefix='',depth=0)=>{
  if(depth>3)throw Error('Linked directory nesting exceeds three levels.')
  const list=[]
  for await(const [name,entry] of dir.entries()){
   if(++visited>MAX_DIRECTORY_ENTRIES)throw Error('Linked directory has too many entries.')
   list.push([name,entry])
  }
  list.sort((a,b)=>a[0].localeCompare(b[0]))
  for(const [name,entry] of list){
   if(!name||name.startsWith('.')||name.includes('/')||name.includes('\\'))continue
   const path=prefix?prefix+'/'+name:name
   if(!validPath(path))throw Error('Linked source contains an unsupported path.')
   if(entry.kind==='directory')await walk(entry,path,depth+1)
   else if(entry.kind==='file')await read(await entry.getFile(),path)
  }
 }
 if(source.kind==='file')await read(await handle.getFile(),source.name)
 else await walk(handle)
 return result
}
export function replaceLinkedSnapshot(files,sourceId,snapshot){
 const list=Array.isArray(files)?files:[]
 if(!Array.isArray(snapshot)||snapshot.some(x=>x.linkId!==sourceId))throw Error('Invalid linked snapshot.')
 const preserved=list.filter(f=>f.linkId!==sourceId)
 if(preserved.length+snapshot.length>10)throw Error('Project exceeds ten reference files; last snapshot preserved.')
 const old=new Map(list.filter(f=>f.linkId===sourceId).map(f=>[f.id,f]))
 const next=snapshot.map(f=>{const previous=old.get(f.id);return previous&&previous.content===f.content&&previous.name===f.name?previous:f})
 const combined=[...preserved,...next]
 return combined.length===list.length&&combined.every((f,i)=>f===list[i])?list:combined
}
export async function openHandleDb(indexedDBFactory=globalThis.indexedDB){
 if(!indexedDBFactory)throw Error('This browser does not support persistent file handles.')
 return new Promise((resolve,reject)=>{
  const r=indexedDBFactory.open('goreecloud-workspace-linked-handles',1)
  r.onupgradeneeded=()=>r.result.createObjectStore('handles')
  r.onsuccess=()=>resolve(r.result)
  r.onerror=()=>reject(r.error||Error('Failed to open linked-source storage.'))
 })
}
export async function savedHandle(action,id,handle,dbFactory){
 if(!['put','get','delete'].includes(action)||typeof id!=='string'||!/^[a-z0-9-]{1,40}$/i.test(id))throw Error('Invalid source-handle operation.')
 const db=await openHandleDb(dbFactory)
 try{
  return await new Promise((resolve,reject)=>{
   const tx=db.transaction('handles',action==='get'?'readonly':'readwrite')
   const object=tx.objectStore('handles')
   const request=action==='get'?object.get(id):action==='put'?object.put(handle,id):object.delete(id)
   request.onsuccess=()=>{if(action==='get')resolve(request.result||null)}
   request.onerror=()=>reject(request.error||Error('File handle operation failed.'))
   tx.oncomplete=()=>{if(action!=='get')resolve(true)}
   tx.onabort=()=>reject(tx.error||Error('File handle transaction aborted.'))
   tx.onerror=()=>reject(tx.error||Error('File handle transaction failed.'))
  })
 }finally{db.close()}
}

export async function fetchDropboxSnapshot(source,fetcher=fetch){
 validateLinkedSource(source)
 if(source.kind!=='dropbox-file')throw Error('Not a Dropbox linked source.')
 const response=await fetcher('/api/integrations/dropbox/import-text',{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:source.path})
 })
 const data=await response.json()
 if(!response.ok)throw Error(data.error||'Dropbox read access is unavailable.')
 if(typeof data.name!=='string'||data.name.length>110||!suitable(data.name,data.size)||
  typeof data.content!=='string'||new TextEncoder().encode(data.content).length>65536||data.content.includes(String.fromCharCode(0)))
  throw Error('Linked Dropbox file is unsupported or too large.')
 return [{id:source.id+':'+data.name,name:data.name,content:data.content,source:'linked-dropbox',
  linkId:source.id,relativePath:data.name,createdAt:Date.now()}]
}
