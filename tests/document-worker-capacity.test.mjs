import test from 'node:test'
import assert from 'node:assert/strict'
import {withDocumentWorkerSlot} from '../server/document-routes.mjs'
test('shared worker slots reject overload and recover after each operation',async()=>{
 const resolve=[]
 const work=()=>withDocumentWorkerSlot(()=>new Promise(done=>resolve.push(done)))
 const first=work(),second=work()
 assert.equal(resolve.length,2)
 await assert.rejects(work(),error=>error.status===429&&/busy/.test(error.message))
 resolve[0]('first')
 assert.equal(await first,'first')
 const third=work()
 assert.equal(resolve.length,3)
 resolve[1]('second');resolve[2]('third')
 assert.deepEqual(await Promise.all([second,third]),['second','third'])
})
test('failed worker releases its shared slot',async()=>{
 const error=new Error('conversion failed')
 await assert.rejects(withDocumentWorkerSlot(async()=>{throw error}),error)
 assert.equal(await withDocumentWorkerSlot(async()=>42),42)
})
