import http from 'node:http'
import net from 'node:net'
import { lookup as dnsLookup } from 'node:dns/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { inspectTlsClientHello } from './provider-tls-client-hello.mjs'

const ALLOWED_HOSTS = new Set(['api.openai.com', 'auth.openai.com'])
const TARGET_PORT = 443
const MAX_TUNNELS = 24
const MAX_HELLO_BYTES = 65536
const HANDSHAKE_TIMEOUT_MS = 8000
const IDLE_TIMEOUT_MS = 180_000

export function parseAllowedAuthority(authority) {
  if (typeof authority !== 'string' || authority.length > 256) return null
  const match = /^([a-z0-9.-]+):([0-9]+)$/.exec(authority.toLowerCase())
  if (!match || !ALLOWED_HOSTS.has(match[1]) || Number(match[2]) !== TARGET_PORT) return null
  return match[1]
}

// Every IPv4 DNS answer must be globally routable; never forward metadata,
// localhost, reserved or private IP destinations.
export function isPublicIpv4(address) {
  if (net.isIP(address) !== 4) return false
  const [a, b, c] = address.split('.').map(Number)
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false
  if (a === 100 && b >= 64 && b <= 127) return false
  if (a === 169 && b === 254) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && (b === 0 || b === 168 || (b === 88 && c === 99))) return false
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false
  if (a === 203 && b === 0 && c === 113) return false
  if (a === 192 && b === 0 && c === 2) return false
  return true
}

function reject(socket, status = 403) {
  if (socket.destroyed) return
  const reason = status === 403 ? 'Forbidden' : status === 429 ? 'Too Many Requests' : 'Bad Gateway'
  socket.end('HTTP/1.1 ' + status + ' ' + reason + '\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
}

export function createProviderProxy({ lookup = dnsLookup, connect = net.connect } = {}) {
  let active = 0
  const server = http.createServer((_request, response) => {
    response.writeHead(405, { 'Cache-Control': 'no-store', 'Content-Length': '0' })
    response.end()
  })
  server.on('connect', async (request, client, head) => {
    const hostname = parseAllowedAuthority(request.url)
    if (!hostname) return reject(client, 403)
    if (active >= MAX_TUNNELS) return reject(client, 429)
    active++
    let released = false
    let upstream
    const release = () => { if (!released) { released = true; active-- } }
    client.on('error', () => { client.destroy() })
    client.once('close', () => { upstream?.destroy(); release() })
    client.setTimeout(HANDSHAKE_TIMEOUT_MS, () => client.destroy())
    try {
      const answers = await lookup(hostname, { all: true, family: 4 })
      if (!Array.isArray(answers) || !answers.length || answers.some(record => !isPublicIpv4(record.address))) {
        release()
        return reject(client, 502)
      }
      if (client.destroyed) { release(); return }
      // CONNECT gets 200 before TLS begins; hold every byte until the hostname
      // in the plaintext ClientHello exactly matches the allowlisted authority.
      // Invalid, absent, oversized and encrypted/hidden SNI fail closed.
      let hello = Buffer.alloc(0)
      let started = false
      const onHandshake = chunk => {
        if (started || client.destroyed) return
        if (hello.length + chunk.length > MAX_HELLO_BYTES) return client.destroy()
        hello = Buffer.concat([hello, chunk], hello.length + chunk.length)
        const match = inspectTlsClientHello(hello, hostname)
        if (match === 'invalid') return client.destroy()
        if (match !== 'valid') return
        started = true
        client.pause()
        client.removeListener('data', onHandshake)
        client.setTimeout(IDLE_TIMEOUT_MS, () => client.destroy())
        // No outbound socket has been opened until the CONNECT and TLS host
        // checks have both passed. DNS IP is pinned before connecting.
        upstream = connect({ host: answers[0].address, port: TARGET_PORT })
        upstream.setTimeout?.(IDLE_TIMEOUT_MS, () => upstream.destroy())
        upstream.once('error', () => client.destroy())
        upstream.once('close', () => { client.destroy(); release() })
        upstream.once('connect', () => {
          if (client.destroyed) return upstream.destroy()
          upstream.write(hello)
          hello = Buffer.alloc(0)
          client.pipe(upstream)
          upstream.pipe(client)
          client.resume()
        })
      }
      client.on('data', onHandshake)
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head?.length) onHandshake(head)
    } catch {
      upstream?.destroy()
      release()
      reject(client, 502)
    }
  })
  server.on('clientError', (_error, socket) => reject(socket, 502))
  return server
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createProviderProxy().listen(3128, '0.0.0.0')
}
