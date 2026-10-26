import test from 'node:test'
import assert from 'node:assert/strict'
import {updateStreamingReply} from '../src/chat-stream-state.js'
import {createBrowserStorageGuard, BrowserStorageConflict} from '../src/browser-storage-guard.js'

const key='workspace-ai-history-v1'
const seed=()=>[
  {id:'first', messages:[{id:'ask',role:'user',content:'Question'},{id:'reply',role:'assistant',content:'',pending:true}],updatedAt:1},
  {id:'second',messages:[{id:'another',role:'assistant',content:'Leave me',pending:false}],updatedAt:2}
]
function storage(initial) {
  const map = new Map(Object.entries(initial))
  return {getItem:k=>map.has(k)?map.get(k):null,setItem:(k,v)=>map.set(k,v)}
}

test('each streamed delta can be synchronously persisted before UI acknowledgment', () => {
  const initial=seed(), disk=storage({[key]:JSON.stringify(initial)}),guard=createBrowserStorageGuard(disk,[key])
  let state=initial
  for(const text of ['partial ','🌍']) {
    const next=updateStreamingReply(state,'first','reply',m=>({...m,content:m.content+text}))
    guard.write(key,JSON.stringify(next))
    state=next
    assert.equal(JSON.parse(disk.getItem(key))[0].messages[1].content,state[0].messages[1].content)
  }
  const completed=updateStreamingReply(state,'first','reply',m=>({...m,pending:false}))
  guard.write(key,JSON.stringify(completed))
  assert.equal(JSON.parse(disk.getItem(key))[0].messages[1].pending,false)
  assert.equal(initial[0].messages[1].content,'')
  assert.equal(completed[1],initial[1])
})

test('late or mismatched stream events cannot alter a different reply or missing chat', () => {
  const initial=seed()
  assert.throws(()=>updateStreamingReply(initial,'missing','reply',m=>m),/conversation changed/)
  assert.throws(()=>updateStreamingReply(initial,'first','another',m=>m),/no longer current/)
  assert.throws(()=>updateStreamingReply(initial,'second','another',m=>m),/no longer current/)
  const settled=updateStreamingReply(initial,'first','reply',m=>({...m,pending:false}))
  assert.throws(()=>updateStreamingReply(settled,'first','reply',m=>m),/no longer current/)
  assert.equal(initial[0].messages[1].pending,true)
})

test('storage quota failures and concurrent-tab edits do not replace the saved reply', () => {
  const initial=seed(), raw=JSON.stringify(initial),disk=storage({[key]:raw})
  const guard=createBrowserStorageGuard(disk,[key])
  const next=updateStreamingReply(initial,'first','reply',m=>({...m,content:'partial'}))
  const failing={getItem:disk.getItem,setItem:()=>{throw Error('QuotaExceededError')}}
  const quotaGuard=createBrowserStorageGuard(failing,[key])
  assert.throws(()=>quotaGuard.write(key,JSON.stringify(next)),/QuotaExceededError/)
  assert.equal(disk.getItem(key),raw)
  disk.setItem(key,JSON.stringify([...initial].reverse()))
  assert.throws(()=>guard.write(key,JSON.stringify(next)),BrowserStorageConflict)
  assert.notEqual(disk.getItem(key),JSON.stringify(next))
})

test('malformed transformations cannot alter response identity or message type', () => {
  for (const bad of [m=>({...m,id:'different'}),m=>({...m,role:'user'}),m=>({...m,content:null}),()=>null]) {
    assert.throws(()=>updateStreamingReply(seed(),'first','reply',bad),/Invalid streamed reply update/)
  }
})
