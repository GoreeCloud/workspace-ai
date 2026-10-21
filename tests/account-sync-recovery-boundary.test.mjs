import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {mkdtemp,rm,symlink,unlink,writeFile,chmod,readFile} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {createAccountSyncStore} from '../server/account-sync-store.mjs'

const subject='synthetic-account'
const filename=createHash('sha256').update('workspace-ai-sync-v1\0'+subject).digest('hex')+'.json'
const envelope={kind:'workspace-ai-encrypted-v1',salt:'AAAAAAAAAAAAAAAAAAAAAA',iv:'AAAAAAAAAAAAAAAA',ciphertext:'AAAAAAAAAAAAAAAAAAAAAA'}
test('encrypted sync store rejects symlink replacement without reading target data',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'workspace-sync-boundary-'))
 try{
  const store=createAccountSyncStore({directory})
  const first=await store.put(subject,envelope,null)
  const item=path.join(directory,filename)
  const target=path.join(directory,'target.json')
  await writeFile(target,JSON.stringify({revision:first.revision,envelope}),{mode:0o600})
  await unlink(item)
  await symlink(target,item)
  await assert.rejects(()=>store.get(subject))
  await assert.rejects(()=>store.put(subject,envelope,first.revision))
  assert.match(await readFile(target,'utf8'),/workspace-ai-encrypted-v1/)
 }finally{await rm(directory,{recursive:true,force:true})}
})
test('sync store refuses corrupt revisions and publicly readable account files',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'workspace-sync-validation-'))
 try{
  const store=createAccountSyncStore({directory})
  const first=await store.put(subject,envelope,null)
  const file=path.join(directory,filename)
  await writeFile(file,JSON.stringify({revision:'malformed',envelope}),{mode:0o600})
  await assert.rejects(()=>store.get(subject),/Invalid account sync revision/)
  await assert.rejects(()=>store.put(subject,envelope,first.revision),/Invalid account sync revision/)
  await writeFile(file,JSON.stringify({revision:first.revision,envelope}),{mode:0o600})
  await chmod(file,0o644)
  await assert.rejects(()=>store.get(subject),/Unsafe account sync file/)
 }finally{await rm(directory,{recursive:true,force:true})}
})
