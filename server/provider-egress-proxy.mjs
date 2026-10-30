import http from 'node:http'
import net from 'node:net'
import { lookup as dnsLookup } from 'node:dns/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const ALLOWED_HOSTS = new Set(['api.openai.com', 'auth.openai.com'])
const TARGET_PORT = 443
const MAX_TUNNELS = 24
const IDLE_TIMEOUT_MS = 180_000

export function parseAllowedAuthority(authority) {
  if (typeof authority !== 'string' || authority.length > 256) return null
  const match = /^([a-z0-9.-]+):([0-9]+)$/.exec(authority.toLowerCase())
  if (!match || !ALLOWED_HOSTS.has(match[1]) || Number(match[2]) !== TARGET_PORT) return null
  return match[1]
}

// For this proxy, IPv6 results are not accepted. Every IPv4 DNS answer must be
// globally routable; never forward cloud metadata, localhost or private IPs.
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
    const release = () => { if (!released) { released = true; active-- } }
    let upstream
    client.setTimeout(IDLE_TIMEOUT_MS, () => client.destroy())
    client.once('close', () => { upstream?.destroy(); release() })
    try {
      const answers = await lookup(hostname, { all: true, family: 4 })
      if (!Array.isArray(answers) || !answers.length || answers.some(record => !isPublicIpv4(record.address))) {
        release()
        return reject(client, 502)
      }
      if (client.destroyed) { release(); return }
      // Pin the reviewed DNS answer to avoid re-resolution between ACL and connect.
      upstream = connect({ host: answers[0].address, port: TARGET_PORT })
      upstream.setTimeout?.(IDLE_TIMEOUT_MS, () => upstream.destroy())
      upstream.once('error', () => { release(); reject(client, 502) })
      upstream.once('close', () => { client.destroy(); release() })
      upstream.once('connect', () => {
        if (client.destroyed) { upstream.destroy(); return }
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
        if (head?.length) upstream.write(head)
        client.pipe(upstream)
        upstream.pipe(client)
      })
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
