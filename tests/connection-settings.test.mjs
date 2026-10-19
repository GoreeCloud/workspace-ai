import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { attachCredentialSettings } from '../server/credential-settings.mjs'

test('session credential endpoint enforces origin, validation, and clearing', async () => {
  let received = null
  const app = express()
  app.use(express.json())
  attachCredentialSettings(app, {
    allowedOrigins: new Set(['http://127.0.0.1:3031']),
    setCredential: value => { received = value },
    clearCredential: () => { received = null }
  })
  const server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener))
  })
  try {
    const url = 'http://127.0.0.1:' + server.address().port + '/api/settings/credential'
    const body = JSON.stringify({ key: 'synthetic-credential-for-unit-test' })
    const rejected = await fetch(url, {
      method: 'POST', headers: { Origin: 'https://outside.example', 'Content-Type': 'application/json' }, body
    })
    assert.equal(rejected.status, 403)
    assert.equal(received, null)
    const invalid = await fetch(url, {
      method: 'POST', headers: { Origin: 'http://127.0.0.1:3031', 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'short' })
    })
    assert.equal(invalid.status, 400)
    const saved = await fetch(url, {
      method: 'POST', headers: { Origin: 'http://127.0.0.1:3031', 'Content-Type': 'application/json' }, body
    })
    assert.equal(saved.status, 200)
    const response = await saved.text()
    assert.equal(response.includes('synthetic-credential'), false)
    assert.equal(received, 'synthetic-credential-for-unit-test')
    const cleared = await fetch(url, {
      method: 'DELETE', headers: { Origin: 'http://127.0.0.1:3031' }
    })
    assert.equal(cleared.status, 200)
    assert.equal(received, null)
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
})
