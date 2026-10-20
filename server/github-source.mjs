// Strict, bounded GitHub Contents API text reader. Authorized GoreeCloud identity only.
export class GitHubSourceError extends Error{
 constructor(status,message){super(message);this.status=status}
}
const MAX_BYTES=65536
const EXTENSIONS=new Set(['txt','md','markdown','csv','tsv','json','yaml','yml','log','js','jsx','ts','tsx','py','html','css','xml','sql','toml','sh','mjs','cjs','go','rs','java','kt'])
export function validateGitHubSource({repo,path}={}){
 if(typeof repo!=='string'||!/^[a-zA-Z0-9_.-]{1,100}$/.test(repo)||repo==='.'||repo==='..')throw new GitHubSourceError(400,'Invalid GoreeCloud repository.')
 if(typeof path!=='string'||path.length>220||!path||/[/\\]$/.test(path)||/\\/.test(path)||/[\x00-\x1f\x7f]/.test(path))throw new GitHubSourceError(400,'Invalid repository file path.')
 const parts=path.split('/')
 if(parts.length>8||parts.some(p=>!p||p==='.'||p==='..'||p.length>90||p.endsWith(' ')||p.endsWith('.')))throw new GitHubSourceError(400,'Unsupported repository file path.')
 const filename=parts.at(-1)
 if(filename==='.env'||filename.startsWith('.env.')||/\.(?:pem|key|p12|pfx|keystore)$/i.test(filename))throw new GitHubSourceError(400,'Sensitive key files are not previewable.')
 if(!EXTENSIONS.has(filename.split('.').at(-1).toLowerCase()))throw new GitHubSourceError(400,'Only supported text/source files may be previewed.')
 return {repo,path,requestPath:parts.map(p=>encodeURIComponent(p)).join('/')}
}
async function boundedBody(response,max=185000){
 const len=Number(response.headers?.get?.('content-length'))
 if(Number.isFinite(len)&&len>max)throw new GitHubSourceError(413,'GitHub returned an oversized document.')
 if(!response.body||typeof response.body.getReader!=='function'){
  const raw=await response.text()
  if(Buffer.byteLength(raw,'utf8')>max)throw new GitHubSourceError(413,'GitHub returned an oversized document.')
  return raw
 }
 const reader=response.body.getReader(),parts=[];let size=0
 try{
  for(;;){
   const {done,value}=await reader.read()
   if(done)break
   size+=value.byteLength
   if(size>max)throw new GitHubSourceError(413,'GitHub returned an oversized document.')
   parts.push(value)
  }
 }finally{reader.releaseLock()}
 return Buffer.concat(parts.map(x=>Buffer.from(x))).toString('utf8')
}
export async function readGitHubSource(token,{repo,path}={},fetchImpl=fetch){
 const selected=validateGitHubSource({repo,path})
 if(typeof token!=='string'||token.length<1||token.length>2048||/\s/.test(token))throw new GitHubSourceError(409,'Connect the authorized GoreeCloud GitHub account.')
 const uri='https://api.github.com/repos/GoreeCloud/'+encodeURIComponent(selected.repo)+'/contents/'+selected.requestPath
 let response
 try{
  response=await fetchImpl(uri,{method:'GET',redirect:'error',signal:AbortSignal.timeout(10000),
   headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json',
    'X-GitHub-Api-Version':'2022-11-28','User-Agent':'GoreeCloud-Workspace-AI'}})
 }catch{throw new GitHubSourceError(503,'GitHub source file could not be reached.')}
 if(!response.ok){
  if(response.status===401)throw new GitHubSourceError(401,'GitHub credential expired.')
  if(response.status===403)throw new GitHubSourceError(403,'GitHub denied source file access.')
  if(response.status===404)throw new GitHubSourceError(404,'Repository file not found.')
  throw new GitHubSourceError(503,'GitHub source file unavailable.')
 }
 let data
 try{data=JSON.parse(await boundedBody(response))}catch(e){
  if(e instanceof GitHubSourceError)throw e
  throw new GitHubSourceError(502,'GitHub returned invalid source metadata.')
 }
 if(!data||Array.isArray(data)||data.type!=='file'||data.encoding!=='base64'||typeof data.content!=='string'||
  !Number.isSafeInteger(data.size)||data.size<0||data.size>MAX_BYTES||typeof data.sha!=='string'||!/^[0-9a-f]{40}$/.test(data.sha))
  throw new GitHubSourceError(415,'GitHub source is unsupported, binary, or exceeds 64 KB.')
 const encoded=data.content.replace(/\s/g,'')
 if(!/^[a-zA-Z0-9+/]*={0,2}$/.test(encoded)||encoded.length>90000)throw new GitHubSourceError(415,'GitHub source encoding is unsupported.')
 const bytes=Buffer.from(encoded,'base64')
 if(bytes.byteLength!==data.size||bytes.byteLength>MAX_BYTES)throw new GitHubSourceError(415,'GitHub source size does not match metadata.')
 let content
 try{content=new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{throw new GitHubSourceError(415,'File is not valid UTF-8 text.')}
 if(content.includes('\0'))throw new GitHubSourceError(415,'Binary files cannot be previewed.')
 return {repo:selected.repo,path:selected.path,sha:data.sha,content,size:data.size,readOnly:true}
}
