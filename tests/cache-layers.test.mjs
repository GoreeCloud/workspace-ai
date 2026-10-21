import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createEphemeralCache} from '../server/ephemeral-cache.mjs'
import {promptCacheKey} from '../server/prompt-cache.mjs'
import {streamResponse} from '../server/stream.mjs'

test('bounded memory cache coalesces concurrent requests and expires deterministically',async()=>{
 let now=100,loads=0
 const cache=createEphemeralCache({ttlMs:50,maxEntries:2,clock:()=>now})
 const load=()=>{loads++;return {models:['one']}}
 const [a,b]=await Promise.all([cache.load('account1',load),cache.load('account1',load)])
 assert.deepEqual(a,b);assert.equal(loads,1)
 await cache.load('account1',load);assert.equal(loads,1)
 now+=51
 await cache.load('account1',load);assert.equal(loads,2)
 await cache.load('account2',load)
 await cache.load('account3',load)
 assert.equal(cache.stats().entries,2)
 await cache.load('account1',load)
 assert.equal(loads,5)
 cache.clear();assert.equal(cache.stats().entries,0)
})

test('failed fetch is not cached, even during concurrent work',async()=>{
 const cache=createEphemeralCache()
 let calls=0
 const failing=()=>{calls++;throw Error('offline')}
 const outcomes=await Promise.allSettled([cache.load('x',failing),cache.load('x',failing)])
 assert.equal(calls,1)
 assert.ok(outcomes.every(x=>x.status==='rejected'))
 assert.deepEqual(await cache.load('x',()=>[1]),[1])
})

test('prompt cache keys are scoped by account, credential, model, first prompt and process',()=>{
 const key=o=>promptCacheKey({accountId:'account-a',credential:'api-key-a',model:'model-1',messages:[{role:'system',content:'Shared context'}, {role:'user',content:'Request'}],...o})
 const first=key()
 assert.match(first,/^gcwa_[0-9a-f]{48}$/)
 assert.equal(first,key({messages:[{content:'Shared context'},{content:'New question'}]}))
 assert.notEqual(first,key({accountId:'account-b'}))
 assert.notEqual(first,key({credential:'new-api-key'}))
 assert.notEqual(first,key({model:'model-2'}))
 assert.notEqual(first,key({messages:[{content:'Different project'}]}))
 assert.ok(!first.includes('Shared context'))
 assert.equal(promptCacheKey({credential:'x',model:'y',messages:[]}),null)
})

test('static cache is restricted to fingerprinted public assets; private endpoints stay no-store',async()=>{
 const sw=await readFile(new URL('../public/sw.js',import.meta.url),'utf8')
 const server=await readFile(new URL('../server/index.mjs',import.meta.url),'utf8')
 assert.match(sw,/\/api\//)
 assert.match(sw,/\/auth\//)
 assert.match(sw,/cacheFirst/)
 assert.match(sw,/isFingerprintAsset/)
 assert.match(server,/Cache-Control', 'no-store'/)
 assert.match(server,/immutable/)
 assert.match(server,/express\.static/)
})

test('server only sends prompt cache keys on separately billed API route and reports actual cached usage',async()=>{
 const [server,stream,view]=await Promise.all(['server/index.mjs','server/stream.mjs','src/App.jsx'].map(p=>readFile(new URL('../'+p,import.meta.url),'utf8')))
 assert.match(server,/route === 'api'/)
 assert.match(server,/prompt_cache_key/)
 assert.match(stream,/cachedInputTokens/)
 assert.match(view,/e\.type==='usage'/)
})


test('revoking cache while an upstream lookup is in flight cannot repopulate old data',async()=>{
 const cache=createEphemeralCache()
 let resolve
 const inflight=cache.load('old-account',()=>new Promise(done=>{resolve=done}))
 await Promise.resolve()
 cache.clear()
 resolve({private:'previous account'})
 await inflight
 assert.equal(cache.stats().entries,0)
 const fresh=await cache.load('old-account',()=>({safe:'new session'}))
 assert.deepEqual(fresh,{safe:'new session'})
})


test('provider completed response reports cached input usage without inventing hits',async()=>{
 const frame=event=>'data: '+JSON.stringify(event)+'\n\n'
 const events=[]
 await streamResponse(new Response(
  frame({type:'response.output_text.delta',delta:'Answer'})+
  frame({type:'response.completed',response:{usage:{input_tokens:2048,input_tokens_details:{cached_tokens:1024}}}})
 ),entry=>events.push(entry))
 assert.deepEqual(events,[{type:'delta',text:'Answer'},
  {type:'usage',inputTokens:2048,cachedInputTokens:1024},{type:'complete'}])
 const invalid=[]
 await streamResponse(new Response(frame({type:'response.completed',response:{usage:{input_tokens:50,input_tokens_details:{cached_tokens:100}}}})),
  entry=>invalid.push(entry))
 assert.deepEqual(invalid,[{type:'complete'}])
})
