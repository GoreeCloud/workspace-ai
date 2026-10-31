import test from 'node:test'
import assert from 'node:assert/strict'
import { createHostedCredentialSessions, HOSTED_COOKIE } from '../server/hosted-credential-sessions.mjs'

const response = () => ({
  headers: {},
  setHeader(name, value) { this.headers[name] = value }
})
const cookieOf = res => res.headers['Set-Cookie'].split(';')[0]
const request = cookie => ({ headers: cookie === undefined ? {} : { cookie } })

test('isolated browser sessions have independently scoped keys and verification', () => {
  const sessions = createHostedCredentialSessions()
  const first = response(), second = response()
  const a = sessions.begin(request(), first)
  const b = sessions.begin(request(), second)
  assert.ok(a && b && a !== b)
  assert.notEqual(cookieOf(first), cookieOf(second))
  assert.match(first.headers['Set-Cookie'], /; Secure; HttpOnly; SameSite=Strict; Max-Age=7200/)
  a.key = 'synthetic-a'
  a.verification = {state:'verified',checkedAt:'synthetic'}
  assert.equal(sessions.find(request(cookieOf(first))), a)
  assert.equal(sessions.find(request(cookieOf(second))), b)
  assert.equal(b.key, '')
  assert.equal(b.verification.state, 'untested')
})

test('ambiguous, unknown, malformed and oversized cookies fail closed', () => {
  const sessions = createHostedCredentialSessions()
  const first = response()
  sessions.begin(request(), first)
  const valid = cookieOf(first)
  assert.equal(sessions.find(request()), null)
  assert.equal(sessions.find(request(valid + '; ' + valid)), null)
  assert.equal(sessions.find(request(valid.replace(/.$/, '!'))), null)
  assert.equal(sessions.find(request(HOSTED_COOKIE + '=' + 'A'.repeat(43))), null)
  assert.equal(sessions.find(request('x='.repeat(3000))), null)
})

test('session cap does not evict or disclose another browser secret', () => {
  const sessions = createHostedCredentialSessions({maxSessions:1})
  const first = response()
  const a = sessions.begin(request(), first)
  a.key = 'synthetic-secret'
  const extra = response()
  assert.equal(sessions.begin(request(), extra), null)
  assert.equal(extra.headers['Set-Cookie'], undefined)
  assert.equal(sessions.find(request(cookieOf(first))).key, 'synthetic-secret')
})

test('absolute lifetime expires active sessions and erases the old key', () => {
  let clock = 0
  const sessions = createHostedCredentialSessions({now: () => clock, idleMs:100, lifetimeMs:250})
  const res = response()
  const a = sessions.begin(request(), res)
  a.key = 'synthetic-temporary'
  const own = request(cookieOf(res))
  clock = 90
  assert.equal(sessions.find(own), a)
  clock = 180
  assert.equal(sessions.find(own), a)
  clock = 250
  assert.equal(sessions.find(own), null)
  assert.equal(a.key, '')
  const next = response()
  assert.notEqual(sessions.begin(own, next), a)
  assert.notEqual(cookieOf(res), cookieOf(next))
  clock = 351
  assert.equal(sessions.find(request(cookieOf(next))), null)
})

test('a short idle timeout expires a browser that has not returned', () => {
  let clock = 0
  const sessions = createHostedCredentialSessions({now: () => clock, idleMs:50, lifetimeMs:500})
  const res = response()
  const a = sessions.begin(request(), res)
  a.key = 'synthetic'
  clock = 51
  assert.equal(sessions.find(request(cookieOf(res))), null)
  assert.equal(a.key, '')
})
