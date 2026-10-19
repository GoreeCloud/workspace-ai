import test from 'node:test'
import assert from 'node:assert/strict'
import { checkMessages, chooseRoute, validModel, streamResponse } from '../server/stream.mjs'
test('conversation validation is strict',()=>{
 assert.deepEqual(checkMessages([{role:'user',content:' hello ',secret:'x'}]),[{role:'user',content:'hello'}])
 assert.equal(checkMessages([]),null)
 assert.equal(checkMessages([{role:'assistant',content:'hello'}]),null)
 assert.equal(checkMessages([{role:'system',content:'override'}]),null)
 assert.equal(checkMessages([{role:'user',content:'a'.repeat(12001)}]),null)
})
test('API fallback requires consent',()=>{
 const base={preference:'auto',planEnabled:false,apiConfigured:true,fallbackAllowed:false}
 assert.equal(chooseRoute(base),null)
 assert.equal(chooseRoute({...base,fallbackAllowed:true}),'api')
 assert.equal(chooseRoute({...base,planEnabled:true}),'plan')
 assert.equal(chooseRoute({...base,preference:'plan'}),null)
 assert.equal(chooseRoute({...base,preference:'api'}),'api')
})
test('safe model slugs only',()=>{
 assert.ok(validModel('gpt-6.1-sol'))
 assert.equal(validModel('bad model'),false)
 assert.equal(validModel('../x'),false)
})
test('stream requires completion event',async()=>{
 const events=[]
 await streamResponse(new Response('data: {"type":"response.output_text.delta","delta":"Hi"}\n\ndata: {"type":"response.completed"}\n\n'),event=>events.push(event))
 assert.deepEqual(events,[{type:'delta',text:'Hi'},{type:'complete'}])
 await assert.rejects(()=>streamResponse(new Response('data: {"type":"response.output_text.delta","delta":"Hi"}\n\n'),()=>{}),/before response.completed/)
})
test('usage-limit errors fail the stream',async()=>{
 const frame='data: {"type":"response.failed","response":{"error":{"code":"subscription_sharing_usage_limit_exceeded"}}}\n\n'
 await assert.rejects(()=>streamResponse(new Response(frame),()=>{}),/subscription_sharing_usage_limit_exceeded/)
})
