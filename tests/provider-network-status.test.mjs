import test from 'node:test'
import assert from 'node:assert/strict'
import { providerNetworkStatus } from '../server/provider-network-status.mjs'

test('local client is not marked as private-egress disabled', () => {
  assert.equal(providerNetworkStatus({}, false), 'local')
})

test('private preview is blocked without the exact reviewed proxy configuration', () => {
  for (const env of [
    {}, {NODE_USE_ENV_PROXY:'1'}, {HTTPS_PROXY:'http://provider-proxy:3128'},
    {NODE_USE_ENV_PROXY:'1',HTTPS_PROXY:'http://localhost:3128'},
    {NODE_USE_ENV_PROXY:'true',HTTPS_PROXY:'http://provider-proxy:3128'}
  ]) assert.equal(providerNetworkStatus(env,true), 'disabled')
})

test('proxy environment indicates configured routing, not verified credentials', () => {
  assert.equal(providerNetworkStatus({NODE_USE_ENV_PROXY:'1',HTTPS_PROXY:'http://provider-proxy:3128'},true),'configured')
})
