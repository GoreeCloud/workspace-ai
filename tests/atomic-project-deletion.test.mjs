import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {newProject} from '../src/project-model.js'
import {projectContext,inferenceMessages} from '../src/project-context.js'
import {prepareProjectDeletion} from '../src/project-deletion.js'
import {scopedChatMessages} from '../src/chat-project-boundary.js'
import {persistWorkspaceRestore} from '../src/workspace-backup.js'
import {createBrowserStorageGuard} from '../src/browser-storage-guard.js'

const alpha={...newProject('alpha','Alpha'),memory:'Alpha-private memory',shareFilesWith:[]}
const beta={...newProject('beta','Beta'),memory:'Beta-only memory',shareFilesWith:['alpha']}
const workspace={projects:[alpha,beta],agents:[{id:'one',projectId:'alpha',name:'Private'},{id:'two',projectId:'beta',name:'Kept'}],
 prompts:[{id:'x',projectId:'alpha',content:'private'},{id:'y',projectId:'beta',content:'keep'}],pinned:['one'],collapsed:false,expanded:{}}
const messages=[{id:'question',role:'user',content:'Alpha secret roadmap'},{id:'answer',role:'assistant',content:'Private answer'}]
const chats=[{id:'one',title:'Alpha chat',projectId:'alpha',messages,updatedAt:1},
 {id:'two',title:'Beta chat',projectId:'beta',messages:[{id:'b',role:'user',content:'Beta context'}],updatedAt:2}]
test('project deletion keeps visible chats but isolates every prior message',()=>{
 const result=prepareProjectDeletion(chats,workspace,'alpha',1234)
 assert.deepEqual(result.workspace.projects.map(p=>p.id),['beta'])
 assert.deepEqual(result.workspace.projects[0].shareFilesWith,[])
 assert.deepEqual(result.workspace.agents.map(a=>a.id),['two'])
 assert.deepEqual(result.workspace.prompts.map(p=>p.id),['y'])
 assert.equal(result.chats[0].projectId,null)
 assert.equal(result.chats[0].contextStart,messages.length)
 assert.deepEqual(scopedChatMessages(result.chats[0]),[])
 assert.equal(result.chats[0].messages.length,2)
 assert.doesNotMatch(JSON.stringify(inferenceMessages(scopedChatMessages(result.chats[0]),'')),/Alpha secret roadmap|Private answer|Alpha-private memory/)
 assert.match(projectContext(result.workspace,'beta'),/Beta-only memory/)
 assert.equal(result.chats[1],chats[1])
 assert.equal(workspace.projects.length,2)
})
test('invalid project deletions fail without mutating anything',()=>{
 assert.throws(()=>prepareProjectDeletion(chats,workspace,'absent'),/not found/)
 assert.equal(workspace.projects.length,2)
 assert.equal(chats[0].projectId,'alpha')
})
test('browser storage quota rejection cannot delete project without updating chats',()=>{
 const history='workspace-ai-history-v1',metadata='workspace-ai-workspace-v1'
 const map=new Map([[history,JSON.stringify(chats)],[metadata,JSON.stringify(workspace)]])
 let failOnce=true
 const storage={
  getItem:key=>map.get(key)??null,
  setItem:(key,value)=>{if(key===metadata&&failOnce){failOnce=false;throw Error('QuotaExceededError')}map.set(key,value)},
  removeItem:key=>map.delete(key)
 }
 const guard=createBrowserStorageGuard(storage,[history,metadata])
 const deletion=prepareProjectDeletion(chats,workspace,'alpha')
 assert.throws(()=>guard.restore(()=>persistWorkspaceRestore(storage,history,metadata,deletion)),/Could not save/)
 assert.deepEqual(JSON.parse(storage.getItem(metadata)).projects.map(p=>p.id),['alpha','beta'])
 assert.equal(JSON.parse(storage.getItem(history))[0].projectId,'alpha')
})
test('app and project editor perform one combined storage transaction',()=>{
 const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8')
 const views=readFileSync(new URL('../src/WorkspaceViews.jsx',import.meta.url),'utf8')
 assert.match(app,/prepareProjectDeletion\(chatsRef\.current,workspaceRef\.current,projectId\)/)
 assert.match(app,/storageGuard\.current\.restore\(\(\)=>persistWorkspaceRestore\(localStorage,KEY,WORKSPACE_KEY,next\)\)/)
 assert.match(views,/onDeleteProject\?\.\(project\.id\)/)
 assert.doesNotMatch(views,/chats\.filter\(c=>c\.projectId===project\.id\)\.forEach/)
})
