// Encrypted, account-scoped snapshot storage. No plaintext workspace data is accepted.
import {createHash,randomUUID} from 'node:crypto'
import {promises as fs} from 'node:fs'
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
  let meta
  try{meta=await fs.lstat(file)}catch(e){if(e.code==='ENOENT')return {revision:null,envelope:null};throw e}
  if(!meta.isFile()||meta.isSymbolicLink()||(meta.mode&0o077)!==0||meta.size>SYNC_ENVELOPE_MAX)throw Error('Unsafe account sync file')
  const value=JSON.parse(await fs.readFile(file,'utf8'))
  return {revision:value.revision,envelope:validateEncryptedEnvelope(value.envelope)}
 })
 const put=(subject,envelope,expectedRevision)=>serialize(async()=>{
  await ensureDirectory()
  const clean=validateEncryptedEnvelope(envelope)
  if(!(expectedRevision===null||typeof expectedRevision==='string'&&/^[0-9a-f-]{36}$/.test(expectedRevision)))throw Error('Invalid sync revision')
  const file=accountPath(subject)
  let current=null
  try{
   const meta=await fs.lstat(file)
   if(!meta.isFile()||meta.isSymbolicLink()||(meta.mode&0o077)!==0||meta.size>SYNC_ENVELOPE_MAX)throw Error('Unsafe account sync file')
   const saved=JSON.parse(await fs.readFile(file,'utf8'))
   current=saved.revision
  }catch(e){if(e.code!=='ENOENT')throw e}
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
