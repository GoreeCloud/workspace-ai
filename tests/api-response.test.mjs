import test from 'node:test'
import assert from 'node:assert/strict'
import {apiFailureMessage, readApiResponse} from '../src/api-response.js'

const json = (value, status = 200) => new Response(JSON.stringify(value), {status, headers: {'content-type': 'application/json'}})

test('valid JSON objects keep the existing app API contract', async () => {
  const value = {connected: true, models: ['local']}
  assert.deepEqual(await readApiResponse(json(value)), value)
})

test('structured server failures preserve safe user-facing reasons', async () => {
  await assert.rejects(readApiResponse(json({error: 'Local state is unavailable'}, 503)), /Local state is unavailable/)
  await assert.rejects(readApiResponse(json({error: 'x'.repeat(1200)}, 422)), error => error.message.length === 300)
})

test('unauthenticated HTML gateway challenges provide login guidance without echoing HTML', async () => {
  const html = '<html><form>Password for user</form></html>'
  await assert.rejects(readApiResponse(new Response(html, {status: 401, headers: {'content-type':'text/html'}})), error =>
    /authentication.*401/i.test(error.message) && !error.message.includes('Password for user'))
})

test('forbidden private-network responses provide access guidance', async () => {
  await assert.rejects(readApiResponse(new Response('Forbidden', {status: 403})), /private network/)
})

test('transient HTML reverse-proxy failures retain their HTTP status', async () => {
  for (const status of [502, 503, 504]) {
    await assert.rejects(readApiResponse(new Response('<h1>Proxy failure</h1>', {status})), error =>
      error.message.includes('HTTP ' + status) && !error.message.includes('<h1>'))
  }
})

test('unexpected success payloads fail with an actionable message, not a parser stack trace', async () => {
  for (const body of ['<html>Gateway login</html>', '[]', 'null', '42', '{']) {
    await assert.rejects(readApiResponse(new Response(body, {status: 200})), /invalid server response/i)
  }
})

test('errors without a structured reason preserve an actionable status', async () => {
  await assert.rejects(readApiResponse(json({detail:'Rejected'}, 429), 'Send failed'), /Send failed \(HTTP 429\)/)
  await assert.rejects(readApiResponse(json([], 500)), /HTTP 500/)
  assert.equal(apiFailureMessage(401).includes('authentication'), true)
})
