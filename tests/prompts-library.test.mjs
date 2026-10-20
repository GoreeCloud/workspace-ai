import test from 'node:test'
import assert from 'node:assert/strict'
import {normalizePrompts,promptsForContext,appendPromptDraft} from '../src/prompt-library.js'
import {createWorkspaceBackup,parseWorkspaceBackup,prepareWorkspaceRestore} from '../src/workspace-backup.js'
const globalPrompt={id:'global1',title:'Summarize',content:'Summarize this clearly',projectId:null,createdAt:2,updatedAt:3}
const secret={id:'onlyA',title:'Private project',content:'Only project A',projectId:'a',createdAt:2,updatedAt:3}
const projects=[{id:'a',name:'A',createdAt:2},{id:'b',name:'B',createdAt:2}]
const workspace={projects,prompts:[globalPrompt,secret],pinned:[],collapsed:false,expanded:{projects:true,prompts:true,pinned:true,chats:true}}
test('prompt library enforces project-only visibility and global reuse',()=>{
 const cleaned=normalizePrompts([globalPrompt,secret],['a','b'],true)
 assert.equal(promptsForContext(cleaned,null).length,1)
 assert.deepEqual(promptsForContext(cleaned,'b').map(p=>p.id),['global1'])
 assert.deepEqual(promptsForContext(cleaned,'a').map(p=>p.id),['global1','onlyA'])
 assert.equal(appendPromptDraft('Earlier','Next'),'Earlier\n\nNext')
 assert.throws(()=>appendPromptDraft('x'.repeat(12000),'extra'),/limit/)
})
test('malformed, orphaned, duplicate, and oversized prompts are rejected for backups',()=>{
 assert.throws(()=>normalizePrompts([secret],[],true),/Invalid/)
 assert.throws(()=>normalizePrompts([globalPrompt,globalPrompt],['a'],true),/duplicate/)
 assert.throws(()=>normalizePrompts([{...globalPrompt,content:'z'.repeat(12001)}],[],true),/Invalid/)
 assert.throws(()=>normalizePrompts(Array.from({length:101},(_,i)=>({...globalPrompt,id:String(i)})),[],true),/100/)
 assert.deepEqual(normalizePrompts([secret],[]),[])
})
test('prompt library survives workspace export and replace import',()=>{
 const exported=createWorkspaceBackup([],workspace)
 const parsed=parseWorkspaceBackup(JSON.stringify(exported))
 assert.deepEqual(parsed.workspace.prompts,[globalPrompt,secret])
 const restored=prepareWorkspaceRestore([],{},exported,'replace')
 assert.equal(restored.workspace.prompts[1].projectId,'a')
})
test('backup merge rejects project ID collisions as a source of private prompt leakage',()=>{
 const existing={...workspace,projects:[{id:'a',name:'Existing A',createdAt:1}],prompts:[{...globalPrompt,content:'Original'}]}
 const archive=createWorkspaceBackup([],workspace)
 const merged=prepareWorkspaceRestore([],existing,archive,'merge')
 assert.equal(merged.workspace.prompts.find(p=>p.id==='global1').content,'Original')
 assert.equal(merged.workspace.prompts.some(p=>p.id==='onlyA'),false)
})
