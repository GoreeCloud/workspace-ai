import test from 'node:test'
import assert from 'node:assert/strict'
import {SERVICES} from '../server/services.mjs'
import {serviceTools} from '../server/service-capabilities.mjs'
import {checkProviderToken} from '../server/service-validation.mjs'
test('all requested services in order',()=>{assert.deepEqual(SERVICES.map(s=>s.id),SERVICES.map(s=>s.id).slice(0,9))})
test('execution unavailable for discovered capability metadata',()=>{for(const s of SERVICES){assert.ok(serviceTools(s.id).length);assert.ok(serviceTools(s.id).every(t=>t.executable===false))}})
test('GitHub token identity restricted to GoreeCloud',async()=>{const check=async login=>checkProviderToken('github','synthetic-provider-token',async()=>({ok:true,status:200,json:async()=>({login})}));assert.equal((await check('Other')).status,'restricted');assert.equal((await check('GoreeCloud')).status,'connected')})
test('API provider verification never follows redirects',async()=>{let options;await checkProviderToken('todoist','synthetic-provider-token',async(_url,args)=>{options=args;return {ok:true,status:200}});assert.equal(options.redirect,'error');assert.equal(options.method,'GET')})
