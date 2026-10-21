import test from 'node:test'
import assert from 'node:assert/strict'
import {accountScopedKey,browserAccountScope,selectBrowserAccount,scopeFromStatus} from '../src/account-workspace-scope.js'
const A='a'.repeat(24),B='b'.repeat(24)
test('guest and each verified identity have distinct browser chat/project/theme namespaces',()=>{
 selectBrowserAccount(A)
 const chatA=accountScopedKey('workspace-ai-history-v1')
 const projectA=accountScopedKey('workspace-ai-workspace-v1')
 selectBrowserAccount(B)
 assert.notEqual(accountScopedKey('workspace-ai-history-v1'),chatA)
 assert.notEqual(accountScopedKey('workspace-ai-workspace-v1'),projectA)
 selectBrowserAccount(null)
 assert.equal(browserAccountScope(),null)
 assert.equal(accountScopedKey('workspace-ai-history-v1'),'workspace-ai-history-v1')
 assert.equal(accountScopedKey('workspace-ai-theme'),'workspace-ai-theme')
})
test('browser never loads a purported signed-in workspace without a verified ID',()=>{
 assert.equal(scopeFromStatus({connected:false}),null)
 assert.equal(scopeFromStatus({connected:true,accountId:A}),A)
 assert.throws(()=>scopeFromStatus({connected:true}),/Unverified/)
 assert.throws(()=>scopeFromStatus({connected:'true'}),/Invalid/)
 assert.throws(()=>selectBrowserAccount('bad'),/Invalid/)
 assert.throws(()=>accountScopedKey('credentials.json'),/Unsupported/)
})
