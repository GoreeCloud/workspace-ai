import test from 'node:test'
import assert from 'node:assert/strict'
import {createChromeLocalClient} from '../server/chrome-mcp-local.mjs'

test('Chrome MCP refuses to launch with no approved hosts',async()=>{
 let started=false
 const client=createChromeLocalClient({
  executable:'/nonexistent/test-mcp',
  allowedHosts:[],
  runner:()=>{started=true;throw Error('unexpected launch')}
 })
 await assert.rejects(client.call('list_pages',{}),/hostname allowlist/)
 assert.equal(started,false)
})

test('Chrome MCP refuses private and malformed hostnames before spawning',async()=>{
 let launches=0
 for(const allowedHosts of [['localhost'],['127.0.0.1'],['example..org'],['https://example.org'],['evil.org/path']]){
  const client=createChromeLocalClient({
   executable:'/nonexistent/test-mcp',allowedHosts,
   runner:()=>{launches++;throw Error('unexpected launch')}
  })
  await assert.rejects(client.call('list_pages',{}),/hostname allowlist/)
 }
 assert.equal(launches,0)
})
