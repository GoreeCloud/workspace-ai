import test from 'node:test'
import assert from 'node:assert/strict'
import {createWorkspaceBackup,parseWorkspaceBackup} from '../src/workspace-backup.js'
test('document cards survive portable workspace backup and restore',()=>{
 const doc={title:'GoreeCloud',format:'md',name:'GoreeCloud.md',source:'# GoreeCloud\n\nSystems overview',bytes:28}
 const chat={id:'chat-doc',title:'Document',updatedAt:1,projectId:null,messages:[
  {id:'user',role:'user',content:'Create a Markdown file'},
  {id:'answer',role:'assistant',content:doc.source,document:doc}
 ]}
 const workspace={projects:[],pinned:[],collapsed:false,expanded:{}}
 const archive=createWorkspaceBackup([chat],workspace)
 const restored=parseWorkspaceBackup(JSON.stringify(archive))
 assert.deepEqual(restored.chats[0].messages[1].document,doc)
})
