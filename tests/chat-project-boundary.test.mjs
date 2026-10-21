import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {newProject} from '../src/project-model.js'
import {projectContext,inferenceMessages} from '../src/project-context.js'
import {conversationContextStart,moveChatToProject,scopedChatMessages} from '../src/chat-project-boundary.js'
import {createWorkspaceBackup,parseWorkspaceBackup,prepareWorkspaceRestore} from '../src/workspace-backup.js'

const message=(role,content)=>({id:content,role,content})
const chat={
 id:'chat-one',title:'Project A conversation',projectId:'a',updatedAt:1,
 messages:[message('user','A private roadmap'),message('assistant','A confidential answer')]
}
const workspace={
 projects:[{...newProject('a','Alpha'),memoryEnabled:true,memory:'Alpha project memory'}, {...newProject('b','Beta'),memoryEnabled:true,memory:'Beta project memory'}],
 pinned:[],collapsed:false,expanded:{projects:true}
}
test('moving a chat quarantines earlier turns without deleting the visible history',()=>{
 const moved=moveChatToProject(chat,'b',2)
 assert.equal(moved.contextStart,2)
 assert.equal(moved.projectId,'b')
 assert.equal(moved.messages.length,2)
 assert.deepEqual(scopedChatMessages(moved),[])
 const request=inferenceMessages([...scopedChatMessages(moved),message('user','What next?')],projectContext(workspace,'b','What next?'))
 assert.doesNotMatch(JSON.stringify(request),/A private roadmap|A confidential answer|Alpha project memory/)
 assert.match(JSON.stringify(request),/Beta project memory/)
 assert.equal(moveChatToProject(moved,'b'),moved)
})
test('multiple project moves isolate every previous segment',()=>{
 const first=moveChatToProject(chat,'b',2)
 const next={...first,messages:[...first.messages,message('user','B-only update'),message('assistant','Beta answer')]}
 assert.deepEqual(scopedChatMessages(next).map(m=>m.content),['B-only update','Beta answer'])
 const second=moveChatToProject(next,'a',3)
 assert.equal(second.contextStart,4)
 assert.deepEqual(scopedChatMessages(second),[])
 assert.equal(second.messages.length,4)
 const final={...second,messages:[...second.messages,message('user','Alpha again')]}
 assert.deepEqual(scopedChatMessages(final).map(m=>m.content),['Alpha again'])
})
test('context boundary remains intact in exported and restored browser archives',()=>{
 const moved=moveChatToProject(chat,'b')
 const backup=createWorkspaceBackup([moved],workspace)
 const restored=parseWorkspaceBackup(JSON.stringify(backup))
 assert.equal(restored.chats[0].contextStart,2)
 assert.equal(scopedChatMessages(restored.chats[0]).length,0)
 const merged=prepareWorkspaceRestore([], {projects:[],pinned:[],prompts:[],expanded:{}},backup,'merge')
 assert.equal(merged.chats[0].contextStart,2)
})
test('orphaned or colliding project identities never inherit old AI history',()=>{
 const archive=createWorkspaceBackup([chat],workspace)
 const orphan=parseWorkspaceBackup(JSON.stringify({...archive,workspace:{...archive.workspace,projects:[workspace.projects[1]]}}))
 assert.equal(orphan.chats[0].projectId,null)
 assert.equal(orphan.chats[0].contextStart,2)
 const merged=prepareWorkspaceRestore([],{...workspace,projects:[workspace.projects[0]]},archive,'merge')
 assert.equal(merged.chats[0].projectId,null)
 assert.equal(merged.chats[0].contextStart,2)
})
test('malformed boundary values are rejected in backup and fail closed in inference',()=>{
 const bad={...chat,contextStart:-1}
 assert.deepEqual(scopedChatMessages(bad),[])
 assert.equal(conversationContextStart({...chat,contextStart:'0'}),2)
 const data=createWorkspaceBackup([chat],workspace)
 assert.throws(()=>parseWorkspaceBackup(JSON.stringify({...data,chats:[bad]})),/Invalid conversation context boundary/)
 assert.throws(()=>parseWorkspaceBackup(JSON.stringify({...data,chats:[{...chat,contextStart:99}]})),/Invalid conversation context boundary/)
 assert.equal(scopedChatMessages({...chat,contextStart:99}).length,0)
})
test('AI request and memory capture wiring honor the context boundary',()=>{
 const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8')
 assert.match(app,/inferenceMessages\(requestHistory,context\)/)
 assert.match(app,/moveChatToProject\(c,safeId\)/)
 assert.match(app,/messageIndex>=conversationContextStart\(chat\)/)
})
