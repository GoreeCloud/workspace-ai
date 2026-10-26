import test from 'node:test'
import assert from 'node:assert/strict'
import {createConnectionRefresher} from '../src/connection-refresh.js'

const status = {connected:true,planEnabled:true,apiConfigured:true,model:'test'}
const deferred = () => {let resolve, reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}}

test('initial status and plan models update atomically', async () => {
  const results = []
  const refresh = createConnectionRefresher({readStatus:async()=>status,readModels:async()=>({planModels:[{slug:'safe-model'}]}),publish:v=>results.push(v)})
  assert.equal(await refresh(),true)
  assert.deepEqual(results,[{status,models:[{slug:'safe-model'}],connectionError:'',modelError:''}])
})

test('failed status clears stale provider readiness until a verified retry succeeds',async()=>{
  const results=[]
  let offline=true
  const refresh=createConnectionRefresher({readStatus:async()=>{if(offline)throw Error('HTTP 503 unavailable');return status},
    readModels:async()=>({planModels:[{slug:'safe-model'}]}),publish:v=>results.push(v)})
  assert.equal(await refresh(),false)
  assert.equal(results[0].status.apiConfigured,false)
  assert.equal(results[0].status.planEnabled,false)
  assert.match(results[0].connectionError,/503/)
  offline=false
  assert.equal(await refresh(),true)
  assert.equal(results.at(-1).connectionError,'')
  assert.equal(results.at(-1).status.apiConfigured,true)
})

test('late failures cannot overwrite a newer healthy connection',async()=>{
  const first=deferred(),results=[]
  let count=0
  const refresh=createConnectionRefresher({readStatus:()=>++count===1?first.promise:Promise.resolve(status),
    readModels:async()=>({planModels:[{slug:'model'}]}),publish:v=>results.push(v)})
  const stale=refresh()
  assert.equal(await refresh(),true)
  first.reject(Error('old network failure'))
  assert.equal(await stale,false)
  assert.equal(results.length,1)
  assert.equal(results[0].status.planEnabled,true)
})

test('late successes cannot override a newer offline state',async()=>{
  const first=deferred(),results=[]
  let count=0
  const refresh=createConnectionRefresher({readStatus:()=>++count===1?first.promise:Promise.reject(Error('network lost')),
    readModels:async()=>({planModels:[]}),publish:v=>results.push(v)})
  const stale=refresh()
  assert.equal(await refresh(),false)
  first.resolve(status)
  assert.equal(await stale,false)
  assert.equal(results.length,1)
  assert.equal(results[0].status.connected,false)
})

test('model endpoint failure does not disable separately configured API access',async()=>{
  const results=[]
  const refresh=createConnectionRefresher({readStatus:async()=>status,readModels:async()=>{throw Error('provider secret details')},publish:v=>results.push(v)})
  assert.equal(await refresh(),true)
  assert.equal(results[0].status.apiConfigured,true)
  assert.deepEqual(results[0].models,[])
  assert.match(results[0].modelError,/temporarily unavailable/)
  assert.doesNotMatch(results[0].modelError,/provider secret/)
})

test('offline event disables stale providers and invalidates pending requests',async()=>{
  const pending=deferred(),results=[]
  const refresh=createConnectionRefresher({readStatus:()=>pending.promise,readModels:async()=>({planModels:[]}),publish:v=>results.push(v)})
  const inFlight=refresh()
  refresh.offline()
  assert.equal(results.length,1)
  assert.equal(results[0].status.apiConfigured,false)
  assert.match(results[0].connectionError,/offline/)
  pending.resolve(status)
  assert.equal(await inFlight,false)
  assert.equal(results.length,1)
})

test('invalid server status never revives provider readiness',async()=>{
  const results=[]
  const refresh=createConnectionRefresher({readStatus:async()=>({connected:true}),readModels:async()=>({planModels:[]}),publish:v=>results.push(v)})
  assert.equal(await refresh(),false)
  assert.equal(results[0].status.connected,false)
  assert.match(results[0].connectionError,/invalid connection status/)
})
