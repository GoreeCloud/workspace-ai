import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {accountImportPlan,LOCAL_SYNC_OWNER_KEY} from '../src/account-sync-consent.js'
const first='a'.repeat(24),second='b'.repeat(24)
test('existing browser projects require explicit account upload consent',()=>{
 const plan=accountImportPlan({accountId:first,workspace:{projects:[{id:'p',memory:'Alpha private'}]},chats:[]})
 assert.equal(plan.hasData,true)
 assert.equal(plan.requiresConfirmation,true)
 assert.equal(plan.differentAccount,false)
 assert.match(plan.message,/projects, memories, chats/)
})
test('switching account requires a stronger warning instead of silently sharing history',()=>{
 const plan=accountImportPlan({accountId:second,previousAccountId:first,chats:[{id:'c'}],workspace:{projects:[]}})
 assert.equal(plan.differentAccount,true)
 assert.equal(plan.requiresConfirmation,true)
 assert.match(plan.message,/previously synchronized/)
 assert.match(plan.message,/intentional cross-account/)
})
test('empty local workspaces do not require migration consent',()=>{
 const plan=accountImportPlan({accountId:first,workspace:{projects:[],agents:[],prompts:[]},chats:[]})
 assert.equal(plan.requiresConfirmation,false)
 assert.throws(()=>accountImportPlan({accountId:'not-verified',chats:[{}]}),/Verified account/)
})
test('browser account binding is metadata and never a credential',()=>{
 assert.match(LOCAL_SYNC_OWNER_KEY,/account/)
 const source=readFileSync(new URL('../src/use-account-sync.js',import.meta.url),'utf8')
 assert.match(source,/window\.confirm\(plan\.message/)
 assert.match(source,/markOwner\(status\.accountId\)/)
 assert.match(source,/markOwner\(activeAccountRef\.current\)/)
})
