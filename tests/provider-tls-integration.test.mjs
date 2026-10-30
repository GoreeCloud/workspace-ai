import test from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import { once } from 'node:events'
import { createProviderProxy } from '../server/provider-egress-proxy.mjs'

const u16 = n => Buffer.from([n >>> 8, n & 255])
const u24 = n => Buffer.from([n >>> 16, (n >>> 8) & 255, n & 255])
function hello(hostname, includeSni = true) {
  const name = Buffer.from(hostname)
  const entry = Buffer.concat([Buffer.from([0]), u16(name.length), name])
  const serverName = Buffer.concat([u16(entry.length), entry])
  const extension = Buffer.concat([u16(0), u16(serverName.length), serverName])
  const extensions = includeSni ? extension : Buffer.alloc(0)
  const body = Buffer.concat([
    Buffer.from([3, 3]), Buffer.alloc(32, 7), Buffer.from([0]),
    Buffer.from([0, 2, 0x13, 0x01]), Buffer.from([1, 0]),
    u16(extensions.length), extensions
  ])
  const handshake = Buffer.concat([Buffer.from([1]), u24(body.length), body])
  return Buffer.concat([Buffer.from([22, 3, 1]), u16(handshake.length), handshake])
}

async function probe({ connectAuthority = 'api.openai.com:443', serverName = 'api.openai.com', sendHello = true, fragment = false, includeSni = true }) {
  let dials = 0
  let bytesForwarded = 0
  let dialTarget = null
  const upstream = net.createServer(socket => socket.on('data', chunk => {
    bytesForwarded += chunk.length
    socket.destroy()
  }))
  upstream.listen(0, '127.0.0.1')
  await once(upstream, 'listening')
  const server = createProviderProxy({
    lookup: async () => [{address:'104.18.21.1',family:4}],
    connect: options => {
      dials++
      dialTarget = options
      return net.connect(upstream.address().port, '127.0.0.1')
    }
  })
  const sockets = new Set()
  server.on('connection', socket => {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  try {
    const result = await new Promise((resolve, reject) => {
      const client = net.connect(server.address().port, '127.0.0.1')
      let status = ''
      let sent = false
      let complete = false
      const timeout = setTimeout(() => { client.destroy(); reject(Error('Tunnel did not finish')) }, 2000)
      client.on('connect', () => client.write('CONNECT ' + connectAuthority + ' HTTP/1.1\r\nHost: ' + connectAuthority + '\r\n\r\n'))
      client.on('data', chunk => {
        status += chunk.toString('latin1')
        if (sent || !status.includes('\r\n\r\n')) return
        sent = true
        if (!sendHello || !status.startsWith('HTTP/1.1 200')) { client.end(); return }
        const data = hello(serverName, includeSni)
        if (fragment) {
          client.write(data.subarray(0, 11))
          setImmediate(() => client.write(data.subarray(11)))
        } else client.write(data)
      })
      client.once('close', () => {
        complete = true
        clearTimeout(timeout)
        resolve({status, dials, bytesForwarded, dialTarget})
      })
      client.on('error', () => { if (!complete) client.destroy() })
    })
    return result
  } finally {
    for (const socket of sockets) socket.destroy()
    await new Promise(resolve => server.close(resolve))
    upstream.closeAllConnections?.()
    await new Promise(resolve => upstream.close(resolve))
  }
}

test('matching SNI is forwarded only after validation and IP pinning', async () => {
  const result = await probe({fragment:true})
  assert.match(result.status, /^HTTP\/1\.1 200 /)
  assert.equal(result.dials, 1)
  assert.ok(result.bytesForwarded > 40)
  assert.deepEqual(result.dialTarget, {host:'104.18.21.1',port:443})
})

test('different SNI on approved CONNECT authority never touches outbound network', async () => {
  const result = await probe({serverName:'another.example'})
  assert.match(result.status, /^HTTP\/1\.1 200 /)
  assert.equal(result.dials, 0)
  assert.equal(result.bytesForwarded, 0)
})

test('missing SNI never touches outbound network', async () => {
  const result = await probe({includeSni:false})
  assert.match(result.status, /^HTTP\/1\.1 200 /)
  assert.equal(result.dials, 0)
})

test('non-allowlisted CONNECT is denied without opening upstream socket', async () => {
  const result = await probe({connectAuthority:'another.example:443'})
  assert.match(result.status, /^HTTP\/1\.1 403 /)
  assert.equal(result.dials, 0)
})
