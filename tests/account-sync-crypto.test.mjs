import test from 'node:test'
import assert from 'node:assert/strict'
import {encryptAccountSnapshot,decryptAccountSnapshot} from '../src/account-sync-crypto.js'
test('encrypted sync snapshot roundtrips without plaintext',async()=>{
 const data={projects:[{name:'Private Alpha',memory:'Example sensitive text'}]}
 const passphrase='SyntheticPassphraseOnlyForTesting123'
 const encoded=await encryptAccountSnapshot(data,passphrase)
 assert.doesNotMatch(JSON.stringify(encoded),/Example sensitive text/)
 assert.deepEqual(await decryptAccountSnapshot(encoded,passphrase),data)
 await assert.rejects(()=>decryptAccountSnapshot(encoded,'DifferentTestPassphrase123'),/Incorrect passphrase/)
})
