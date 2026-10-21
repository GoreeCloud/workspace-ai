import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {createAccountSyncStore} from '../server/account-sync-store.mjs'
const snapshot={kind:'workspace-ai-encrypted-v1',salt:'AAAAAAAAAAAAAAAAAAAAAA',iv:'AAAAAAAAAAAAAAAA',ciphertext:'AAAAAAAAAAAAAAAAAAAAAA'}
test('two accounts remain separate and stale upload is rejected',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'sync-test-'))
 try{
  const store=createAccountSyncStore({directory})
  const first=await store.put('subjectA',snapshot,null)
  assert.equal(first.conflict,false)
  assert.equal((await store.get('subjectB')).envelope,null)
  assert.equal((await store.put('subjectA',snapshot,null)).conflict,true)
  assert.equal((await store.put('subjectA',snapshot,first.revision)).conflict,false)
 }finally{await rm(directory,{recursive:true,force:true})}
})
