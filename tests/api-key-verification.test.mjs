import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { verifyApiKey } from '../server/api-key-verification.mjs'
import { attachCredentialSettings } from '../server/credential-settings.mjs'

test('key verification only GETs the OpenAI model catalog and returns no credential', async () => {
  const key = 'synthetic-key-for-test'
  const result = await verifyApiKey(key, {
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://api.openai.com/v1/models')
      assert.equal(options.method, 'GET')
      assert.equal(options.headers.Authorization, 'Bearer ' + key)
      assert.ok(options.signal)
      return { ok: true, status: 200 }
    }
  })
  assert.equal(result.state, 'verified')
  assert.ok(!JSON.stringify(result).includes(key))
})

test('invalid, restricted and unavailable key states are distinguishable', async () => {
  for (const [code, expected] of [[401,'invalid'],[403,'restricted'],[429,'unavailable'],[503,'unavailable']]) {
    const result = await verifyApiKey('synthetic', { fetchImpl: async()=>({ok:false,status:code}) })
    assert.equal(result.state, expected)
  }
  assert.equal((await verifyApiKey('synthetic', {fetchImpl: async()=>{throw Error('network')}})).state, 'unavailable')
})

test('verification route resets result after key changes and rejects unauthorized origins', async () => {
  let key = ''
  const app = express()
  app.use(express.json())
  const manager = attachCredentialSettings(app, {
    allowedOrigins: new Set(['http://127.0.0.1:3031']),
    getCredential: () => key,
    setCredential: value => { key = value },
    clearCredential: () => { key = '' },
    verifyCredential: async () => ({ state: 'verified', message: 'OpenAI accepted model listing.' })
  })
  const listener = await new Promise(resolve => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server))
  })
  const base = 'http://127.0.0.1:' + listener.address().port + '/api/settings/credential'
  const headers = { Origin: 'http://127.0.0.1:3031', 'Content-Type': 'application/json' }
  try {
    const missing = await fetch(base + '/verify', { method: 'POST', headers })
    assert.equal(missing.status, 409)
    const save = await fetch(base,{method:'POST',headers,body:JSON.stringify({key:'synthetic-key-for-integration-test'})})
    assert.equal(save.status, 200)
    assert.equal(manager.getVerification().state, 'untested')
    const foreign = await fetch(base+'/verify',{method:'POST',headers:{Origin:'https://attacker.example'}})
    assert.equal(foreign.status,403)
    const verify = await fetch(base+'/verify',{method:'POST',headers})
    assert.equal(verify.status,200)
    const verified = await verify.json()
    assert.equal(verified.verification.state,'verified')
    assert.ok(!JSON.stringify(verified).includes(key))
    assert.ok(manager.getVerification().checkedAt)
    const clear = await fetch(base,{method:'DELETE',headers})
    assert.equal(clear.status,200)
    assert.equal(manager.getVerification().state,'untested')
    assert.equal(key,'')
  } finally {
    await new Promise(resolve => listener.close(resolve))
  }
})
