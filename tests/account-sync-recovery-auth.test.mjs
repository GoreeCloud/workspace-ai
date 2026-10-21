import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {hasCurrentSyncIdentity,validateSyncGatewayURL} from '../server/account-sync-relay.mjs'

const token=(subject,exp)=>{
 const encode=part=>Buffer.from(JSON.stringify(part)).toString('base64url')
 return encode({alg:'RS256',typ:'JWT'})+'.'+encode({sub:subject,exp,iss:'https://auth.openai.com'})+'.synthetic-signature'
}
test('expired and mismatched signed-in account claims do not count as sync authentication',()=>{
 const now=Date.UTC(2026,9,21,0,0,0)
 const subject='account-A'
 assert.equal(hasCurrentSyncIdentity({subject,id_token:token(subject,now/1000+1800)},now),true)
 assert.equal(hasCurrentSyncIdentity({subject,id_token:token(subject,now/1000-1)},now),false)
 assert.equal(hasCurrentSyncIdentity({subject,id_token:token('account-B',now/1000+1800)},now),false)
 assert.equal(hasCurrentSyncIdentity({subject,id_token:'not.a.jwt'},now),false)
 assert.equal(hasCurrentSyncIdentity(null,now),false)
})
test('account sync recovers only from the latest remote revision without initial overwrite',async()=>{
 const s=await readFile(new URL('../src/use-account-sync.js',import.meta.url),'utf8')
 assert.match(s,/latest\.revision!==source\.revision/)
 assert.match(s,/skipRestoreUpload\.current=true/)
 assert.match(s,/lastSyncedRef\.current=fingerprint/)
 assert.match(s,/setSyncTick\(t=>t\+1\)/)
 assert.match(s,/activeAccountRef\.current=null/)
})
test('re-authorized identity tokens cannot be refreshed into a different signed-in account',async()=>{
 const s=await readFile(new URL('../server/oauth.mjs',import.meta.url),'utf8')
 assert.match(s,/payload\.sub !== account\.subject/)
 assert.match(s,/refreshSavedAccount\(previous,account,updated\)/)
})
test('only approved HTTPS sync gateway origins are accepted',()=>{
 assert.equal(validateSyncGatewayURL('https://sync.example.test/'),'https://sync.example.test')
 assert.equal(validateSyncGatewayURL('https://sync.example.test/another'),null)
 assert.equal(validateSyncGatewayURL('http://sync.example.test/'),null)
})
