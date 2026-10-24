import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {isPublicIPv4,isNetBirdOverlayIPv4,forcedIPv4Lookup,probePublicDeny,main} from '../scripts/private-dev-public-deny.mjs'

test('public denial requires an actual public IPv4 candidate',async()=>{
  for(const value of ['135.148.45.22','8.8.8.8','1.1.1.1']) assert.equal(isPublicIPv4(value),true)
  for(const value of [undefined,'','127.0.0.1','100.71.27.119','10.0.0.2','172.17.1.1','192.168.1.1','169.254.1.1','198.18.1.1','203.0.113.1','::1','not-an-address']){
    assert.equal(isPublicIPv4(value),false,`unexpected public address: ${value}`)
  }
  assert.throws(()=>probePublicDeny('100.71.27.119'),/verified public VPS IPv4/)
  await assert.rejects(main('127.0.0.1'),/Usage:/)
})

test('public rejection is fail-closed on status, server and TLS',async()=>{
  const text=await readFile(fileURLToPath(new URL('../scripts/private-dev-public-deny.mjs',import.meta.url)),'utf8')
  assert.match(text,/rejectUnauthorized:true/)
  assert.match(text,/servername:hostname/)
  assert.match(text,/lookup:forcedIPv4Lookup\(publicIPv4\)/)
  assert.match(text,/code!==403\s*\|\|\s*String\(server\)\.toLowerCase\(\)!=='caddy'/)
  assert.match(text,/remoteAddress!==publicIPv4/)
  assert.match(text,/isNetBirdOverlayIPv4\(localAddress\)/)
  assert.match(text,/X-Forwarded-For/)
  assert.match(text,/X-Real-IP/)
  assert.match(text,/X-GoreeCloud-Gateway-Token.*deliberately-invalid-qa-token/)
  assert.doesNotMatch(text,/rejectUnauthorized:false|--insecure|\bcurl\s+-k\b/)
  assert.doesNotMatch(text,/Authorization\s*:/)
})

test('public-route validation rejects NetBird source interfaces',()=>{
  for(const addr of ['100.64.0.1','100.71.238.171','100.127.255.254']){
    assert.equal(isNetBirdOverlayIPv4(addr),true)
  }
  for(const addr of ['192.168.4.20','10.0.0.7','135.148.45.22','100.128.0.1','invalid']){
    assert.equal(isNetBirdOverlayIPv4(addr),false)
  }
})

test('forced public resolver supports single- and all-record Node signatures',()=>{
  const lookup=forcedIPv4Lookup('135.148.45.22')
  lookup('irrelevant',{all:true},(error,records)=>{
    assert.equal(error,null)
    assert.deepEqual(records,[{address:'135.148.45.22',family:4}])
  })
  lookup('irrelevant',{all:false},(error,address,family)=>{
    assert.equal(error,null)
    assert.equal(address,'135.148.45.22')
    assert.equal(family,4)
  })
  assert.throws(()=>forcedIPv4Lookup('127.0.0.1'),/verified public VPS IPv4/)
})
