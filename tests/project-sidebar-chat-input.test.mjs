import test from 'node:test'
import assert from 'node:assert/strict'
import {cleanProjectNavigation,orderedProjects,moveProject,reorderProject,chatsForProject} from '../src/project-sidebar.js'
import {normalizeChatAttachments,messageWithAttachments,imageInputsForMessage} from '../src/chat-attachments.js'
import {validateChatImages,multimodalChatInput} from '../server/chat-image-input.mjs'
import {createWorkspaceBackup,parseWorkspaceBackup} from '../src/workspace-backup.js'
import {newProject} from '../src/project-model.js'
const projects=[newProject('one','One'),newProject('two','Two'),newProject('three','Three')]
test('project pins appear above custom sidebar order without changing project identities',()=>{
 const order=['three','two','one'],pinned=['two']
 assert.deepEqual(orderedProjects(projects,order,pinned).map(p=>p.id),['two','three','one'])
 assert.deepEqual(moveProject(projects,order,pinned,'one','up'),['one','two','three'])
 assert.deepEqual(reorderProject(projects,order,pinned,'three','one'),['two','three','one'])
 assert.throws(()=>reorderProject(projects,order,pinned,'three','two'),/Pin or unpin/)
})
test('imported or stale project IDs are discarded without affecting other projects',()=>{
 const nav=cleanProjectNavigation(projects,['missing','three','three'],['missing','one','one'])
 assert.deepEqual(nav.projectOrder,['three','one','two'])
 assert.deepEqual(nav.pinnedProjects,['one'])
})
test('pinned chats sort first only within their own project',()=>{
 const chats=[{id:'a',projectId:'one',updatedAt:5},{id:'b',projectId:'two',updatedAt:10},{id:'c',projectId:'one',updatedAt:15},{id:'d',projectId:'one',updatedAt:20,archived:true}]
 assert.deepEqual(chatsForProject(chats,['a','b'],'one').map(c=>c.id),['a','c'])
 assert.deepEqual(chatsForProject(chats,['a','b'],'two').map(c=>c.id),['b'])
})
test('attachment metadata and project pins roundtrip portable backups without credential fields',()=>{
 const jpeg='data:image/jpeg;base64,'+Buffer.from([255,216,255,...Array(40).fill(8)]).toString('base64')
 const chat={id:'c',title:'Photo',projectId:'one',updatedAt:10,archived:true,contextStart:0,messages:[{id:'m',role:'user',content:'Review',attachments:[{kind:'image',mime:'image/jpeg',name:'photo.jpg',dataUrl:jpeg},{kind:'text',name:'notes.txt',text:'Private excerpt'}]}]}
 const archive=createWorkspaceBackup([chat],{projects,pinned:['c'],projectOrder:['three','one','two'],pinnedProjects:['one'],agents:[],prompts:[],collapsed:false,expanded:{},sensitiveToken:'never-export'})
 assert.deepEqual(archive.workspace.projectOrder,['three','one','two'])
 assert.deepEqual(archive.workspace.pinnedProjects,['one'])
 assert.equal(archive.chats[0].archived,true)
 assert.equal(archive.chats[0].messages[0].attachments.length,2)
 assert.doesNotMatch(JSON.stringify(archive),/never-export/)
 assert.equal(parseWorkspaceBackup(JSON.stringify(archive)).chats[0].messages[0].attachments[1].text,'Private excerpt')
})
test('file references stay text-bounded and malformed images fail closed',()=>{
 const a={kind:'text',name:'example.md',text:'Review only this project'}
 assert.match(messageWithAttachments({content:'Analyze',attachments:[a]}),/Attached text file: example.md/)
 assert.deepEqual(imageInputsForMessage({content:'hi',attachments:[a]}),[])
 assert.throws(()=>normalizeChatAttachments([{kind:'image',name:'evil',mime:'image/svg+xml',dataUrl:'data:image/svg+xml;base64,YQ=='}]),/Unsupported image/)
 assert.equal(validateChatImages(['data:text/html;base64,SGVsbG8=']),null)
 assert.equal(validateChatImages(['data:image/jpeg;base64,'+Buffer.from('not-really-jpeg'.repeat(4)).toString('base64')]),null)
 const good='data:image/jpeg;base64,'+Buffer.from([255,216,255,...Array(40).fill(2)]).toString('base64')
 assert.deepEqual(validateChatImages([good]),[good])
 const messages=[{role:'user',content:'Inspect'}]
 assert.equal(multimodalChatInput(messages,[good])[0].content[1].type,'input_image')
 assert.deepEqual(multimodalChatInput(messages,[]),messages)
})
