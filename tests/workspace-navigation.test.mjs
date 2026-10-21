import test from 'node:test'
import assert from 'node:assert/strict'
import {NAV_SECTIONS,searchChats,readWorkspace,WORKSPACE_KEY} from '../src/workspace-state.js'
test('navigation sections follow required order',()=>{
 assert.deepEqual(NAV_SECTIONS.map(s=>s.id),['mcp','api','projects','agents','engineering','documents','prompts','pinned','chats','archived','settings'])
})
test('search covers titles, messages and project association',()=>{
 const chats=[{id:'a',title:'First',projectId:'p1',updatedAt:1,messages:[{content:'Hello GoreeCloud'}]},{id:'b',title:'Second',updatedAt:2,messages:[]}]
 assert.deepEqual(searchChats(chats,'goreecloud').map(c=>c.id),['a'])
 assert.deepEqual(searchChats(chats,'',null).map(c=>c.id),['b','a'])
 assert.deepEqual(searchChats(chats,'','p1').map(c=>c.id),['a'])
})
test('workspace metadata defaults safely when browser storage is corrupt',()=>{
 const existing=globalThis.localStorage
 try{
  globalThis.localStorage={getItem:()=>'{bad JSON'}
  assert.equal(readWorkspace().collapsed,false)
  assert.deepEqual(readWorkspace().projects,[])
  globalThis.localStorage={getItem:key=>key===WORKSPACE_KEY?JSON.stringify({projects:[{id:'p',name:'Personal'}],pinned:['one'],collapsed:true}):null}
  assert.equal(readWorkspace().collapsed,true)
  assert.equal(readWorkspace().projects[0].name,'Personal')
 }finally{globalThis.localStorage=existing}
})
