import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {isNetBirdIPv4,routeSourceIPv4} from '../scripts/private-dev-netbird-route.mjs'

test('private route requires addresses from only the NetBird overlay range',()=>{
  for(const address of ['100.64.0.1','100.71.27.119','100.127.255.254']){
    assert.equal(isNetBirdIPv4(address),true)
  }
  for(const address of ['127.0.0.1','10.0.0.1','100.63.255.254','100.128.0.1','::1','untrusted.invalid','100.71.0.999']){
    assert.equal(isNetBirdIPv4(address),false)
  }
})

test('UDP route selection sends no payload and reports the loopback source',async()=>{
  await assert.rejects(routeSourceIPv4('not-an-ip'),/IPv4 destination/)
  await assert.rejects(routeSourceIPv4('::1'),/IPv4 destination/)
  assert.equal(await routeSourceIPv4('127.0.0.1'),'127.0.0.1')
})

test('private ingress acceptance checks the selected client route before HTTPS',async()=>{
  const source=await readFile(fileURLToPath(new URL('../scripts/private-dev-ingress-check.mjs',import.meta.url)),'utf8')
  assert.match(source,/routeSourceIPv4/)
  assert.match(source,/isNetBirdIPv4\(source\)/)
  assert.match(source,/rejectUnauthorized:\s*true/)
  assert.doesNotMatch(source,/rejectUnauthorized:\s*false|--insecure|curl\s+-k\b/)
  assert.match(source,/not proof of Caddy-observed peer IP/)
})

test('authorized NetBird client must receive a 401 Basic realm challenge, not a 403 denial',async()=>{
  const {isExpectedOwnerBasicChallenge} = await import('../scripts/private-dev-auth-challenge.mjs')
  assert.equal(isExpectedOwnerBasicChallenge(401,'Basic realm="restricted"'),true)
  assert.equal(isExpectedOwnerBasicChallenge(401,'basic realm="restricted"'),true)
  assert.equal(isExpectedOwnerBasicChallenge(401,['Bearer realm="other"','Basic realm="restricted"']),true)
  for(const [code,challenge] of [
    [403,'Basic realm="restricted"'],
    [200,'Basic realm="restricted"'],
    [401,undefined],
    [401,''],
    [401,'Bearer realm="restricted"'],
    [401,'Basic'],
    [401,'Basicish realm="restricted"']
  ]) assert.equal(isExpectedOwnerBasicChallenge(code,challenge),false)
  const source=await readFile(fileURLToPath(new URL('../scripts/private-dev-ingress-check.mjs',import.meta.url)),'utf8')
  assert.match(source,/isExpectedOwnerBasicChallenge\(code, challenge\)/)
  assert.doesNotMatch(source,/\[401,403\]\.includes/)
})
