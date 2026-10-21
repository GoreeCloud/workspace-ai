import test from 'node:test'
import assert from 'node:assert/strict'
import {renderChatDocument} from '../src/chat-document-service.js'
import {createChatDocument} from '../server/ai-document-routes.mjs'
test('download verifies SHA-256 before exposing bytes',async()=>{
 const input={format:'md',title:'Test',source:'# Test\n\nSome valid body.'}
 const valid=await createChatDocument(input)
 const mock=data=>async()=>new Response(JSON.stringify(data),{status:200})
 assert.equal((await renderChatDocument(input,{fetchImpl:mock(valid)})).name,'Test.md')
 await assert.rejects(renderChatDocument(input,{fetchImpl:mock({...valid,sha256:'0'.repeat(64)})}),/integrity validation failed/)
})
