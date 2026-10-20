// Fixed-host, bounded, token-scoped Google API reads; no mutating HTTP methods.
const error=(code,message)=>Object.assign(new Error(message),{status:code})
const clean=(v,n=160)=>typeof v==='string'?v.slice(0,n):''
const validId=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{10,160}$/.test(v)
const readText=async(response,cap)=>{
  const declared=Number(response.headers?.get?.('content-length'))
  if(Number.isFinite(declared)&&declared>cap)throw error(413,'Google response exceeds the read limit.')
  if(!response.body||typeof response.body.getReader!=='function'){
    const text=await response.text()
    if(Buffer.byteLength(text)>cap)throw error(413,'Google response exceeds the read limit.')
    return text
  }
  const reader=response.body.getReader(),chunks=[];let count=0
  try{for(;;){const {done,value}=await reader.read();if(done)break;count+=value.byteLength
   if(count>cap)throw error(413,'Google response exceeds the read limit.')
   chunks.push(Buffer.from(value))
  }}finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
  try{return new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))}
  catch{throw error(415,'Google file is not UTF-8 text.')}
}
async function providerGet(uri,token,fetcher=fetch,cap=50000){
 if(typeof token!=='string'||!token||token.length>4096)throw error(409,'Connect this Google service first.')
 let res
 try{res=await fetcher(uri,{method:'GET',redirect:'error',headers:{Authorization:'Bearer '+token,Accept:'application/json'},signal:AbortSignal.timeout(10000)})}
 catch{throw error(503,'Google API could not be reached.')}
 if(!res.ok){
  if(res.status===401)throw error(401,'Google connection expired.')
  if(res.status===403)throw error(403,'Google has not granted permission for this resource.')
  if(res.status===404)throw error(404,'Google resource was not found.')
  throw error(503,'Google API read unavailable.')
 }
 return readText(res,cap)
}
async function apiJson(uri,token,fetcher){
 const raw=await providerGet(uri,token,fetcher)
 try{return JSON.parse(raw)}catch{throw error(502,'Google API returned invalid JSON.')}
}
export async function searchGmail(token,{q}={},fetcher=fetch){
 if(typeof q!=='string'||q.length>300||!q.trim()||/[\x00-\x1f\x7f]/.test(q))throw error(400,'Enter a supported Gmail search query.')
 const url=new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages')
 url.searchParams.set('q',q.trim());url.searchParams.set('maxResults','10');url.searchParams.set('includeSpamTrash','false')
 const list=await apiJson(url.toString(),token,fetcher)
 if(!Array.isArray(list.messages)&&list.resultSizeEstimate!==0)throw error(502,'Gmail returned an invalid list.')
 const ids=(list.messages||[]).slice(0,10).filter(x=>validId(x?.id)&&validId(x?.threadId))
 // Metadata is fetched solely for an explicit search; message bodies are never requested.
 const messages=await Promise.all(ids.map(async item=>{
  const u=new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages/'+encodeURIComponent(item.id))
  u.searchParams.set('format','metadata');u.searchParams.append('metadataHeaders','Subject');u.searchParams.append('metadataHeaders','From')
  const data=await apiJson(u.toString(),token,fetcher)
  if(data?.id!==item.id||!Array.isArray(data.payload?.headers))throw error(502,'Gmail message metadata was invalid.')
  const header=name=>clean(data.payload.headers.find(x=>x?.name?.toLowerCase()===name.toLowerCase())?.value,180)
  return {id:item.id,threadId:item.threadId,subject:header('Subject'),from:header('From'),snippet:clean(data.snippet,220)}
 }))
 return {readOnly:true,messages,query:q.trim(),estimatedTotal:Number.isSafeInteger(list.resultSizeEstimate)?Math.min(list.resultSizeEstimate,100000):null}
}
export async function listDriveFiles(token,{},fetcher=fetch){
 const url=new URL('https://www.googleapis.com/drive/v3/files')
 url.searchParams.set('pageSize','50')
 url.searchParams.set('q','trashed = false')
 url.searchParams.set('fields','nextPageToken,incompleteSearch,files(id,name,mimeType,size,modifiedTime)')
 const data=await apiJson(url.toString(),token,fetcher)
 if(!Array.isArray(data.files)||data.incompleteSearch===true)throw error(502,'Drive returned an incomplete file list.')
 const results=data.files.slice(0,50).filter(x=>validId(x?.id)&&typeof x?.name==='string').map(x=>({
  id:x.id,name:clean(x.name,200),mimeType:clean(x.mimeType,100),size:Number.isSafeInteger(Number(x.size))?Number(x.size):null,
  modifiedTime:clean(x.modifiedTime,40)
 }))
 return {readOnly:true,scope:'drive.file',files:results,hasMore:typeof data.nextPageToken==='string'}
}
export async function readDriveTextFile(token,{id}={},fetcher=fetch){
 if(!validId(id))throw error(400,'Invalid Google Drive file ID.')
 const metadataUrl=new URL('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id))
 metadataUrl.searchParams.set('fields','id,name,mimeType,size,modifiedTime')
 const data=await apiJson(metadataUrl.toString(),token,fetcher)
 if(data?.id!==id||typeof data.name!=='string'||!/\.(?:txt|md|csv|tsv|json|yaml|yml|log|js|jsx|ts|tsx|py|html|css|xml|sql)$/i.test(data.name)||
  !['text/plain','text/markdown','text/csv','application/json','application/xml','text/xml','text/html','text/css','text/javascript','application/javascript','application/octet-stream'].includes(data.mimeType)||
  !Number.isSafeInteger(Number(data.size))||Number(data.size)>65536||Number(data.size)<0)
  throw error(415,'Only bounded, Drive-authorized text files can be read. Google Workspace documents need a separate export adapter.')
 const uri='https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id)+'?alt=media'
 const content=await providerGet(uri,token,fetcher,65536)
 if(Buffer.byteLength(content)>65536||content.includes('\0'))throw error(415,'Drive file is not supported UTF-8 text.')
 return {id,name:clean(data.name,200),content,modifiedTime:clean(data.modifiedTime,40),readOnly:true}
}
