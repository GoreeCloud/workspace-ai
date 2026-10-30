import test from 'node:test'
import assert from 'node:assert/strict'
import { parseAllowedAuthority, isPublicIpv4 } from '../server/provider-egress-proxy.mjs'

test('proxy permits only OpenAI HTTPS endpoints', () => {
  assert.equal(parseAllowedAuthority('api.openai.com:443'), 'api.openai.com')
  assert.equal(parseAllowedAuthority('auth.openai.com:443'), 'auth.openai.com')
  for (const name of ['127.0.0.1:443','api.openai.com:80','api.openai.com.example:443']) assert.equal(parseAllowedAuthority(name), null)
})

test('proxy rejects private destinations', () => {
  for (const addr of ['127.0.0.1','10.1.2.3','172.17.0.2','192.168.1.2','169.254.169.254','::1']) assert.equal(isPublicIpv4(addr), false)
  assert.equal(isPublicIpv4('104.18.21.1'), true)
})

import net from 'node:net'
import { once } from 'node:events'
import { createProviderProxy } from '../server/provider-egress-proxy.mjs'

async function runningProxy(options, callback) {
  const server = createProviderProxy(options)
  const sockets = new Set()
  server.on('connection', socket => {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  try { await callback(server.address().port) }
  finally {
    for (const socket of sockets) socket.destroy()
    server.closeAllConnections?.()
    await new Promise(resolve => server.close(resolve))
  }
}

function connectProbe(port, authority) {
  return new Promise((resolve, reject) => {
    const client = net.connect(port, '127.0.0.1')
    let response = ''
    client.setTimeout(3000, () => { client.destroy(); reject(Error('CONNECT timeout')) })
    client.on('connect', () => client.write('CONNECT ' + authority + ' HTTP/1.1\r\nHost: ' + authority + '\r\n\r\n'))
    client.on('data', chunk => {
      response += chunk.toString()
      if (response.includes('\r\n\r\n')) { client.destroy(); resolve(response) }
    })
    client.on('error', reject)
  })
}

test('non-allowlisted CONNECT cannot perform DNS lookup', async () => {
  let lookups = 0
  await runningProxy({lookup: async () => { lookups++; return [] }}, async port => {
    assert.match(await connectProbe(port, 'localhost:443'), /^HTTP\/1\.1 403 /)
    assert.equal(lookups, 0)
  })
})

test('any non-public DNS answer rejects the connection before dial', async () => {
  let dials = 0
  await runningProxy({
    lookup: async () => [{address:'104.18.21.1'}, {address:'10.0.0.4'}],
    connect: () => { dials++; throw Error('unexpected connect') }
  }, async port => {
    assert.match(await connectProbe(port, 'api.openai.com:443'), /^HTTP\/1\.1 502 /)
    assert.equal(dials, 0)
  })
})

test('approved host dials only pinned public address and port 443', async () => {
  let dial
  await runningProxy({
    lookup: async () => [{address:'104.18.21.1'}],
    connect: options => { dial = options; return net.connect({host:'127.0.0.1',port:9}) }
  }, async port => {
    assert.match(await connectProbe(port, 'api.openai.com:443'), /^HTTP\/1\.1 200 /)
    assert.equal(dial, undefined)
  })
})
