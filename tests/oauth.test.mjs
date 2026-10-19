import test from 'node:test'
import assert from 'node:assert/strict'
import { makeAttempt, consumeAttempt } from '../server/oauth.mjs'
test('OAuth uses PKCE and explicit plan permission', () => {
  const uri=makeAttempt({hostId:'urn:uuid:12345678-1234-4123-8123-1234567890ab',callback:'http://127.0.0.1:3031/auth/callback',current:null})
  const url=new URL(uri)
  assert.equal(url.origin,'https://auth.openai.com')
  assert.equal(url.searchParams.get('code_challenge_method'),'S256')
  assert.ok(url.searchParams.get('scope').includes('chatgpt.tokens.use.direct'))
  const state=url.searchParams.get('state')
  const attempt=consumeAttempt(state)
  assert.equal(attempt.callback,'http://127.0.0.1:3031/auth/callback')
  assert.ok(attempt.verifier.length>35)
  assert.throws(()=>consumeAttempt(state),/expired|mismatch/i)
})
