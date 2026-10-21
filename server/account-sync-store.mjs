// Encrypted, account-scoped snapshot storage. No plaintext workspace data is accepted.
import {createHash,randomUUID} from 'node:crypto'
import {promises as fs,constants as fsConstants} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
export const SYNC_ENVELOPE_MAX=16*1024*1024
const nameFor=subject=>createHash('sha256').update('workspace-ai-sync-v1\0'+subject).digest('hex')+'.json'
export function validateEncryptedEnvelope(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||value.kind!=='workspace-ai-encrypted-v1')throw Error('Invalid encrypted snapshot')
 for(const [key,max] of [['salt',100],['iv',100],['ciphertext',SYNC_ENVELOPE_MAX]]){
  if(typeof value[key]!=='string'||value[key].length>max||!/^[A-Za-z0-9_-]+$/.test(value[key]))throw Error('Invalid snapshot '+key)
 }
 if(value.salt.length<20||value.iv.length<15||value.ciphertext.length<20)throw Error('Incomplete encrypted snapshot')
 return {kind:value.kind,salt:value.salt,iv:value.iv,ciphertext:value.ciphertext}
}
const revisionPattern=/^[0-9a-f-]{36}$/
async function readExistingRecord(file){
 const fd=await fs.open(file,fsConstants.O_RDONLY|(fsConstants.O_NOFOLLOW||0))
 try{
  const stat=await fd.stat()
  if(!stat.isFile()||(stat.mode&0o077)!==0||stat.size>SYNC_ENVELOPE_MAX||stat.size<10)
   throw Error('Unsafe account sync file')
  const buffer=Buffer.allocUnsafe(SYNC_ENVELOPE_MAX+1)
  let size=0
  while(size<buffer.length){
   const {bytesRead}=await fd.read(buffer,size,buffer.length-size,null)
   if(!bytesRead)break
   size+=bytesRead
  }
  if(size>SYNC_ENVELOPE_MAX)throw Error('Account sync file exceeds size limit')
  const item=JSON.parse(buffer.toString('utf8',0,size))
  if(!item||typeof item.revision!=='string'||!revisionPattern.test(item.revision))
   throw Error('Invalid account sync revision')
  return {revision:item.revision,envelope:validateEncryptedEnvelope(item.envelope)}
 }finally{await fd.close()}
}
export function createAccountSyncStore({directory=path.join(os.homedir(),'.config','goreecloud','workspace-ai','account-sync')}={}){
 let queue=Promise.resolve()
 const serialize=fn=>{const promise=queue.then(fn);queue=promise.catch(()=>{});return promise}
 const accountPath=subject=>{
  if(typeof subject!=='string'||!subject||subject.length>512)throw Error('Invalid account subject')
  return path.join(directory,nameFor(subject))
 }
 const ensureDirectory=async()=>{
  await fs.mkdir(directory,{recursive:true,mode:0o700})
  const info=await fs.lstat(directory)
  if(!info.isDirectory()||info.isSymbolicLink()||(info.mode&0o077)!==0)throw Error('Unsafe account sync directory permissions')
 }
 const get=subject=>serialize(async()=>{
  await ensureDirectory()
  const file=accountPath(subject)
  try{return await readExistingRecord(file)}
  catch(e){if(e.code==='ENOENT')return {revision:null,envelope:null};throw e}
 })
 const put=(subject,envelope,expectedRevision)=>serialize(async()=>{
  await ensureDirectory()
  const clean=validateEncryptedEnvelope(envelope)
  if(!(expectedRevision===null||typeof expectedRevision==='string'&&revisionPattern.test(expectedRevision)))throw Error('Invalid sync revision')
  const file=accountPath(subject)
  let current=null
  try{current=(await readExistingRecord(file)).revision}
  catch(e){if(e.code!=='ENOENT')throw e}
  if(current!==expectedRevision)return {conflict:true,revision:current}
  const revision=randomUUID(),encoded=JSON.stringify({revision,envelope:clean})
  if(Buffer.byteLength(encoded)>SYNC_ENVELOPE_MAX)throw Error('Encrypted snapshot exceeds server limit')
  const tmp=file+'.'+randomUUID()+'.tmp'
  try{await fs.writeFile(tmp,encoded,{flag:'wx',mode:0o600});await fs.rename(tmp,file)}
  finally{await fs.rm(tmp,{force:true}).catch(()=>{})}
  return {conflict:false,revision}
 })
 return {get,put}
}
