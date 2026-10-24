#!/usr/bin/env node
// Read-only, unauthenticated private ingress acceptance probe.
// Run on an authorized NetBird device only. Never prints cookies or response bodies.
import {lookup} from 'node:dns/promises'
import {request} from 'node:https'
import {isNetBirdIPv4,routeSourceIPv4} from './private-dev-netbird-route.mjs'
import {isExpectedOwnerBasicChallenge} from './private-dev-auth-challenge.mjs'

const hostname = 'workspace-ai-dev.goreecloud.com'

async function status(path) {
  return new Promise((resolve,reject) => {
    const req = request({
      hostname, servername: hostname, port: 443, method: 'GET', path,
      timeout: 8000, rejectUnauthorized: true,
      headers: {'Accept': 'text/html,application/json'}
    }, res => {
      const code = res.statusCode
      res.resume()
      res.once('end', () => resolve({code, challenge: res.headers['www-authenticate']}))
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
  for(const address of new Set(entries.map(entry=>entry.address))){
    const source=await routeSourceIPv4(address)
    if(!isNetBirdIPv4(source)){
      throw new Error('Private hostname route does not select a NetBird overlay source address')
    }
  }
  console.log('PASS client selected NetBird overlay source address (not proof of Caddy-observed peer IP)')
  for (const path of ['/', '/api/status']) {
    const {code, challenge} = await status(path)
    if (!isExpectedOwnerBasicChallenge(code, challenge)) {
      throw new Error(path + ': expected HTTP 401 with an owner Basic authentication challenge; received HTTP ' + code)
    }
    console.log('PASS owner Basic authentication challenge: ' + path + ' (HTTP 401)')
  }
  console.log('PASS trusted HTTPS and default-deny gateway checks')
  console.log('NOTE: authenticated browser/mobile, VPN disconnect, rollback, and credential-isolation tests remain separate gates')
} catch (error) {
  console.error('FAIL private ingress: ' + (error?.message || String(error)))
  process.exitCode = 1
}
