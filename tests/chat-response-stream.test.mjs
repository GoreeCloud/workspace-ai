import test from 'node:test'
import assert from 'node:assert/strict'
import {consumeChatResponse,recoverInterruptedChats} from '../src/chat-response-stream.js'

const stream = (...chunks) => new ReadableStream({
  start(controller) {
    for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk))
    controller.close()
  }
})

test('fragmented events are decoded and delivered once, including multibyte text', async () => {
  const events = []
  await consumeChatResponse(stream('{"type":"meta","provider":"api","model":"gpt-test"}\n{"type":"delta","text":"', 'Hello 🌍', '"}\n{"type":"complete"}\n'), event => events.push(event))
  assert.deepEqual(events, [
    {type:'meta',provider:'api',model:'gpt-test'},
    {type:'delta',text:'Hello 🌍'}
  ])
})

test('interrupted streams do not masquerade as completed answers', async () => {
  const chunks = []
  await assert.rejects(consumeChatResponse(stream('{"type":"delta","text":"partial"}\n'), event => chunks.push(event.text)), /ended unexpectedly/)
  assert.deepEqual(chunks, ['partial'])
})

test('malformed and oversized stream events are rejected without echoing payloads', async () => {
  await assert.rejects(consumeChatResponse(stream('private invalid payload\n'), () => {}), /invalid response event/)
  await assert.rejects(consumeChatResponse(stream('x'.repeat(256 * 1024 + 1)), () => {}), /safety limit/)
  await assert.rejects(consumeChatResponse(stream('{"type":"error","message":"Provider unavailable"}\n'), () => {}), /Provider unavailable/)
  await assert.rejects(consumeChatResponse(stream('{"type":"complete"}\n{"type":"delta","text":"late"}\n'), () => {}), /after response completion/)
  await assert.rejects(consumeChatResponse(stream('{"type":"complete"}\n'), () => {}), /empty response/)
})

test('unfinished assistant messages recover as failed while retaining partial text', () => {
  const original = [{id:'chat',messages:[
    {id:'user',role:'user',content:'Question'},
    {id:'assistant',role:'assistant',content:'Partial answer',pending:true}
  ]}, {id:'finished',messages:[{id:'a',role:'assistant',content:'Done'}]}]
  const recovered = recoverInterruptedChats(original)
  assert.equal(recovered[0].messages[1].content,'Partial answer')
  assert.equal(recovered[0].messages[1].pending,false)
  assert.equal(recovered[0].messages[1].error,true)
  assert.equal(recovered[1],original[1])
  assert.equal(original[0].messages[1].pending,true)
  assert.match(recoverInterruptedChats([{messages:[{role:'assistant',pending:true,content:''}]}])[0].messages[0].content,/interrupted/)
})
