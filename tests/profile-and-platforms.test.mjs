import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createRequire} from 'node:module'
import {profileIdentity,validAvatarDataUrl} from '../src/profile-identity.js'
const require=createRequire(import.meta.url)
const {allowedLocalNavigation,externalAuthenticationLink}=require('../desktop/navigation.cjs')
const ROOT=path.dirname(fileURLToPath(import.meta.url))
test('profile label uses verified public account claims and falls back to guest',()=>{
 assert.deepEqual(profileIdentity({connected:true,displayName:'Example Person',email:'demo@example.invalid'}),{label:'Example Person',initials:'EP',guest:false,email:'demo@example.invalid'})
 assert.equal(profileIdentity({connected:false}).label,'Local guest')
 assert.equal(profileIdentity({connected:true,email:'foo@example.invalid'}).label,'foo@example.invalid')
})
test('only bounded local JPEG profile pictures can be restored',()=>{
 assert.equal(validAvatarDataUrl('data:image/jpeg;base64,AAAA'),true)
 assert.equal(validAvatarDataUrl('data:image/svg+xml;base64,YQ=='),false)
 assert.equal(validAvatarDataUrl('https://example.test/photo.jpg'),false)
 assert.equal(validAvatarDataUrl('data:image/jpeg;base64,'+'A'.repeat(100001)),false)
})
test('desktop navigation only trusts its own loopback port and approved OpenAI OAuth URL',()=>{
 assert.equal(allowedLocalNavigation('http://127.0.0.1:3137/projects',3137),true)
 assert.equal(allowedLocalNavigation('http://localhost:3137/',3137),false)
 assert.equal(allowedLocalNavigation('http://127.0.0.1:3138/',3137),false)
 assert.equal(allowedLocalNavigation('https://example.test/',3137),false)
 assert.equal(externalAuthenticationLink('https://auth.openai.com/api/accounts/authorize'), 'https://auth.openai.com/api/accounts/authorize')
 assert.equal(externalAuthenticationLink('https://example.test/'),null)
 assert.equal(externalAuthenticationLink('http://auth.openai.com/login'),null)
})
test('PWA provides install icons and never caches private API/session/HTML',()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'../public/manifest.webmanifest'),'utf8'))
 assert.equal(manifest.display,'standalone')
 assert.ok(manifest.icons.some(i=>i.sizes==='192x192'))
 assert.ok(manifest.icons.some(i=>i.sizes==='512x512'))
 const worker=fs.readFileSync(path.join(ROOT,'../public/sw.js'),'utf8')
 assert.match(worker,/url.pathname.startsWith\('\/api\/'\)/)
 assert.match(worker,/url.pathname.startsWith\('\/auth\/'\)/)
 assert.match(worker,/url.pathname==='\/'/)
 const desktop=JSON.parse(fs.readFileSync(path.join(ROOT,'../desktop/package.json'),'utf8'))
 assert.deepEqual(desktop.build.linux.target,['AppImage','deb'])
 assert.deepEqual(desktop.build.win.target,['nsis','portable'])
})
