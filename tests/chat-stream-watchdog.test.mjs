import test from 'node:test'
import assert from 'node:assert/strict'
import {createChatStreamWatchdog,CHAT_STREAM_IDLE_TIMEOUT_MS} from '../src/chat-stream-watchdog.js'
import {consumeChatResponse} from '../src/chat-response-stream.js'

function fakeClock() {
  const tasks=new Map()
  let next=1
  return {
    tasks,
    schedule(fn,delay) {const id=next++;tasks.set(id,{fn,delay});return id},
    cancel(id) {tasks.delete(id)},
    tick() {const jobs=[...tasks.values()];tasks.clear();for(const task of jobs)task.fn()}
  }
}
function watcher(controller,clock,idleMs=150) {
  return createChatStreamWatchdog(controller,{idleMs,schedule:clock.schedule,cancel:clock.cancel})
}

test('default inactivity boundary is bounded and activity resets it',()=>{
  assert.equal(CHAT_STREAM_IDLE_TIMEOUT_MS,120_000)
  const stop=new AbortController(),clock=fakeClock(),watch=watcher(stop,clock)
  assert.equal(watch.start(),true)
  assert.equal(watch.start(),false)
  assert.equal(clock.tasks.size,1)
  assert.equal([...clock.tasks.values()][0].delay,150)
  const old=[...clock.tasks.values()][0].fn
  assert.equal(watch.activity(),true)
  assert.equal(clock.tasks.size,1)
  old()
  assert.equal(stop.signal.aborted,false)
  clock.tick()
  assert.equal(stop.signal.aborted,true)
  assert.equal(stop.signal.reason,'stream-inactive')
  assert.equal(clock.tasks.size,0)
  assert.equal(watch.activity(),false)
})

test('manual stop and external offline abort clear timers without overriding abort reason',()=>{
  for(const reason of ['network-offline','manual-stop']) {
    const ctrl=new AbortController(),clock=fakeClock(),watch=watcher(ctrl,clock)
    watch.start()
    ctrl.abort(reason)
    assert.equal(clock.tasks.size,0)
    clock.tick()
    assert.equal(ctrl.signal.reason,reason)
    assert.equal(watch.activity(),false)
    watch.stop()
  }
  const ctrl=new AbortController(),clock=fakeClock(),watch=watcher(ctrl,clock)
  watch.start()
  watch.stop()
  clock.tick()
  assert.equal(ctrl.signal.aborted,false)
  assert.equal(watch.activity(),false)
})

test('does not create timers for invalid or already aborted requests',()=>{
  const clock=fakeClock(),controller=new AbortController()
  controller.abort('offline')
  const watch=watcher(controller,clock)
  assert.equal(watch.start(),false)
  assert.equal(clock.tasks.size,0)
  assert.throws(()=>createChatStreamWatchdog(controller,{idleMs:0}),/Invalid/)
  assert.throws(()=>createChatStreamWatchdog({},{}),/Invalid/)
})

test('an idle network stream is aborted and its already-delivered partial reply survives',async()=>{
  const stop=new AbortController(),clock=fakeClock(),watch=watcher(stop,clock)
  const encoder=new TextEncoder()
  let streamController
  const stream=new ReadableStream({
    start(controller){streamController=controller;controller.enqueue(encoder.encode('{"type":"delta","text":"Saved partial"}\n'))}
  })
  stop.signal.addEventListener('abort',()=>streamController.error(new DOMException('The operation was aborted','AbortError')),{once:true})
  const events=[]
  watch.start()
  const pending=consumeChatResponse(stream,event=>{events.push(event.text);watch.activity()})
  await new Promise(resolve=>setImmediate(resolve))
  assert.deepEqual(events,['Saved partial'])
  assert.equal(clock.tasks.size,1)
  clock.tick()
  await assert.rejects(pending,/abort/i)
  assert.equal(stop.signal.reason,'stream-inactive')
  assert.deepEqual(events,['Saved partial'])
  watch.stop()
  assert.equal(clock.tasks.size,0)
})

test('a completed stream cancels the watchdog, preventing delayed duplicate termination',async()=>{
  const stop=new AbortController(),clock=fakeClock(),watch=watcher(stop,clock)
  const stream=new ReadableStream({start(c){
    c.enqueue(new TextEncoder().encode('{"type":"delta","text":"Done"}\n{"type":"complete"}\n'))
    c.close()
  }})
  const events=[]
  watch.start()
  try{await consumeChatResponse(stream,e=>{events.push(e.text);watch.activity()})}finally{watch.stop()}
  clock.tick()
  assert.deepEqual(events,['Done'])
  assert.equal(stop.signal.aborted,false)
  assert.equal(clock.tasks.size,0)
})
