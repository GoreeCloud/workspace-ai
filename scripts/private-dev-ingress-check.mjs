#!/usr/bin/env node
// Read-only, unauthenticated private ingress acceptance probe.
// Run on an authorized NetBird device only. Never prints cookies or response bodies.
import {lookup} from 'node:dns/promises'
import {request} from 'node:https'
import {isIP} from 'node:net'

const hostname = 'workspace-ai-dev.goreecloud.com'
const isNetBirdIPv4 = address => {
  if (isIP(address) !== 4) return false
  const [first, second] = address.split('.').map(Number)
  return first === 100 && second >= 64 && second <= 127
}

async function status(path) {
  return new Promise((resolve,reject) => {
    const req = request({
      hostname, servername: hostname, port: 443, method: 'GET', path,
      timeout: 8000, rejectUnauthorized: true,
      headers: {'Accept': 'text/html,application/json'}
    }, res => {
      const code = res.statusCode
      res.resume()
      res.once('end', () => resolve(code))
    })
    req.once('timeout', () => req.destroy(new Error('TLS/HTTPS timeout')))
    req.once('error', reject)
    req.end()
  })
}

try {
  const entries = await lookup(hostname, {all: true, verbatim: true})
  if (!entries.length || entries.some(entry => !isNetBirdIPv4(entry.address))) {
    throw new Error('Hostname must resolve exclusively to approved NetBird overlay IPv4 addresses')
  }
  console.log('PASS private NetBird DNS resolution')
  for (const path of ['/', '/api/status']) {
    const code = await status(path)
    if (![401,403].includes(code)) {
      throw new Error(path + ': unauthenticated access returned HTTP ' + code + ', expected 401 or 403')
    }
    console.log('PASS unauthenticated request denied: ' + path + ' (HTTP ' + code + ')')
  }
  console.log('PASS trusted HTTPS and default-deny gateway checks')
  console.log('NOTE: authenticated browser/mobile, VPN disconnect, rollback, and credential-isolation tests remain separate gates')
} catch (error) {
  console.error('FAIL private ingress: ' + (error?.message || String(error)))
  process.exitCode = 1
}
