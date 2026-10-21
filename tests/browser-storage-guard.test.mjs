import test from 'node:test'
import assert from 'node:assert/strict'
import {BrowserStorageConflict,createBrowserStorageGuard,browserStorageLoadProblem} from '../src/browser-storage-guard.js'
import {persistWorkspaceChange} from '../src/workspace-persistence.js'
import {newProject} from '../src/project-model.js'

const CHAT='workspace-ai-history-v1'
const WORKSPACE='workspace-ai-workspace-v1'
function store(initial={}){
 const values=new Map(Object.entries(initial))
 return {
  getItem:key=>values.has(key)?values.get(key):null,
  setItem:(key,value)=>values.set(key,value),
  removeItem:key=>values.delete(key)
 }
}
test('two tabs cannot silently overwrite newer project-memory changes',()=>{
 const initial={projects:[{...newProject('a','A'),memory:'secret',memoryEnabled:true}],pinned:[]}
 const storage=store({[WORKSPACE]:JSON.stringify(initial),[CHAT]:'[]'})
 const first=createBrowserStorageGuard(storage,[CHAT,WORKSPACE])
 const second=createBrowserStorageGuard(storage,[CHAT,WORKSPACE])
 const updated=persistWorkspaceChange({setItem:(k,v)=>first.write(k,v)},WORKSPACE,initial,
  w=>({...w,projects:w.projects.map(p=>({...p,memory:''}))}))
 assert.equal(updated.projects[0].memory,'')
 assert.equal(second.watch(WORKSPACE),true)
 const before=storage.getItem(WORKSPACE)
 assert.throws(()=>persistWorkspaceChange({setItem:(k,v)=>second.write(k,v)},WORKSPACE,initial,
  w=>({...w,projects:w.projects.map(p=>({...p,memory:'stale value'}))})),BrowserStorageConflict)
 assert.equal(storage.getItem(WORKSPACE),before)
 assert.throws(()=>second.write(CHAT,'[]'),BrowserStorageConflict)
})
test('unrelated theme-storage changes do not lock workspace',()=>{
 const storage=store({[CHAT]:'[]'})
 const guard=createBrowserStorageGuard(storage,[CHAT,WORKSPACE])
 storage.setItem('workspace-ai-theme','dark')
 assert.equal(guard.watch('workspace-ai-theme'),false)
 guard.write(WORKSPACE,'{"projects":[]}')
 assert.equal(guard.watch(null),false)
})
test('chat edits and restored metadata update both guarded snapshots',()=>{
 const storage=store({[CHAT]:'[]',[WORKSPACE]:'{}'})
 const guard=createBrowserStorageGuard(storage,[CHAT,WORKSPACE])
 guard.write(CHAT,'[{"id":"one"}]')
 guard.restore(()=>{
  storage.setItem(CHAT,'[{"id":"two"}]')
  storage.setItem(WORKSPACE,'{"projects":[{"id":"p"}]}')
 })
 assert.equal(guard.watch(null),false)
 guard.write(CHAT,'[{"id":"three"}]')
 assert.match(storage.getItem(CHAT),/three/)
})
test('partial failed restore freezes further writes rather than overwriting uncertain state',()=>{
 const storage=store({[CHAT]:'[]',[WORKSPACE]:'{}'})
 const guard=createBrowserStorageGuard(storage,[CHAT,WORKSPACE])
 assert.throws(()=>guard.restore(()=>{
  storage.setItem(CHAT,'[{"id":"partial"}]')
  throw Error('synthetic restore failure')
 }),BrowserStorageConflict)
 assert.throws(()=>guard.write(WORKSPACE,'{}'),BrowserStorageConflict)
})
test('full rollback leaves the storage guard usable',()=>{
 const storage=store({[CHAT]:'[]',[WORKSPACE]:'{}'})
 const guard=createBrowserStorageGuard(storage,[CHAT,WORKSPACE])
 assert.throws(()=>guard.restore(()=>{
  storage.setItem(CHAT,'[{"id":"interim"}]')
  storage.setItem(CHAT,'[]')
  throw Error('expected error')
 }),/expected error/)
 guard.write(WORKSPACE,'{"safe":true}')
 assert.equal(storage.getItem(WORKSPACE),'{"safe":true}')
})
test('refuses stale writes even if no storage event was delivered',()=>{
 const storage=store({[CHAT]:'[]',[WORKSPACE]:'{}'})
 const guard=createBrowserStorageGuard(storage,[CHAT,WORKSPACE])
 storage.setItem(WORKSPACE,'{"changed":true}')
 assert.throws(()=>guard.write(CHAT,'[{"id":"stale"}]'),BrowserStorageConflict)
 assert.equal(storage.getItem(CHAT),'[]')
})
test('storage permission or quota failure never advances expected snapshots',()=>{
 const backing=store({[CHAT]:'[]',[WORKSPACE]:'{}'})
 let fail=true
 const storage={getItem:backing.getItem,setItem:(key,value)=>{
  if(fail){fail=false;throw Error('Quota exceeded')}
  backing.setItem(key,value)
 }}
 const guard=createBrowserStorageGuard(storage,[CHAT,WORKSPACE])
 assert.throws(()=>guard.write(CHAT,'[{"id":"one"}]'),/Quota exceeded/)
 guard.write(CHAT,'[{"id":"two"}]')
 assert.match(backing.getItem(CHAT),/two/)
})
test('App protects initial sends at the persisted 50-chat limit and exposes stale tab notice',async()=>{
 const {readFile}=await import('node:fs/promises')
 const app=await readFile(new URL('../src/App.jsx',import.meta.url),'utf8')
 assert.match(app,/chatsRef\.current\.length>=50/)
 assert.match(app,/if\(!commitChats\(v=>chat/)
 assert.match(app,/storageGuard\.current\.restore/)
 assert.match(app,/storageGuard\.current\.watch\(event\.key\)/)
 assert.match(app,/Reload latest/)
})

test('unreadable chat or project storage blocks startup without clearing data',()=>{
 const corruptChats=store({[CHAT]:'{malformed',[WORKSPACE]:'{"projects":[],"pinned":[]}'})
 assert.match(browserStorageLoadProblem(corruptChats,CHAT,WORKSPACE),/read-only/)
 assert.equal(corruptChats.getItem(CHAT),'{malformed')
 const corruptWorkspace=store({[CHAT]:'[]',[WORKSPACE]:'{"projects":null,"pinned":[]}'})
 assert.match(browserStorageLoadProblem(corruptWorkspace,CHAT,WORKSPACE),/read-only/)
 assert.equal(corruptWorkspace.getItem(WORKSPACE),'{"projects":null,"pinned":[]}')
 assert.equal(browserStorageLoadProblem(store({[CHAT]:'[]',[WORKSPACE]:'{"projects":[],"pinned":[]}'}),CHAT,WORKSPACE),null)
 assert.equal(browserStorageLoadProblem(store(),CHAT,WORKSPACE),null)
})
