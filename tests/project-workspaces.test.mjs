import test from 'node:test'
import assert from 'node:assert/strict'
import {newProject,normalizeProject,normalizeProjects,projectContext,canImportFile,PROJECT_TEXT_BUDGET} from '../src/project-model.js'
import {createWorkspaceBackup,parseWorkspaceBackup} from '../src/workspace-backup.js'

const main=()=>({...newProject('main','Main'),instructions:'Answer in bullet points',memory:'Private roadmap',files:[{id:'f',name:'notes.md',content:'Private spec',source:'local',createdAt:1}]})
test('legacy projects gain safe defaults and private-by-default isolation',()=>{
 const p=normalizeProject({id:'p',name:'Legacy',createdAt:1})
 assert.equal(p.icon,'folder')
 assert.deepEqual(p.shareMemoryWith,[])
 assert.deepEqual(p.shareFilesWith,[])
 assert.deepEqual(p.api,[])
 assert.deepEqual(p.mcp,[])
 assert.deepEqual(p.files,[])
 const projects=normalizeProjects([main(),newProject('other','Other')])
 assert.equal(projectContext({projects},'other'),'')
 assert.match(projectContext({projects},'main'),/Answer in bullet points/)
})
test('explicit outbound sharing copies only selected classes of context',()=>{
 const source=main(),target=newProject('other','Other')
 const projects=[source,target]
 assert.doesNotMatch(projectContext({projects},'other'),/Private/)
 source.shareMemoryWith=['other']
 const notes=projectContext({projects},'other')
 assert.match(notes,/Private roadmap/)
 assert.doesNotMatch(notes,/Private spec/)
 source.shareFilesWith=['other']
 assert.match(projectContext({projects},'other'),/Private spec/)
 assert.equal(projectContext({projects},'absent'),'')
})
test('normalizeProjects strips links to nonexistent projects and self',()=>{
 const source={...main(),shareMemoryWith:['main','ghost','other'],shareFilesWith:['ghost','other']}
 const [normalized]=normalizeProjects([source,newProject('other','Other')])
 assert.deepEqual(normalized.shareMemoryWith,['other'])
 assert.deepEqual(normalized.shareFilesWith,['other'])
})
test('project context enforces bounded reference text and does not carry tools',()=>{
 const p={...main(),instructions:'X'.repeat(4000),memory:'Y'.repeat(4000),api:['github'],mcp:['firecrawl']}
 const result=projectContext({projects:[p]},'main')
 assert.ok(result.length<=PROJECT_TEXT_BUDGET)
 assert.doesNotMatch(result,/github|firecrawl/)
})
test('file extension, limits and metadata validation exclude binary files',()=>{
 assert.equal(canImportFile('photo.png',1024).includes('Only supported'),true)
 assert.equal(canImportFile('source.md',1024),null)
 assert.match(canImportFile('source.md',65000*2),/64 KB/)
 assert.throws(()=>normalizeProject({...main(),files:[{id:'bad',name:'bad.bin',content:'x'.repeat(65000)}]}),/Invalid project file/)
 assert.throws(()=>normalizeProject({...main(),files:[{id:'bad',name:'valid.md',content:'ok'+String.fromCharCode(0)}]}),/Invalid project file/)
 assert.throws(()=>normalizeProjects([{id:'one',name:'One'},{id:'one',name:'Duplicate'}]),/Duplicate/)
})
test('workspace backup roundtrip preserves project instructions, notes, sharing, icons and text attachments',()=>{
 const p={...main(),icon:'rocket',shareMemoryWith:['other'],api:['github'],mcp:['firecrawl']}
 const archive=createWorkspaceBackup([],{
  projects:[p,newProject('other','Other')],pinned:[],collapsed:false,expanded:{chats:true,pinned:true,projects:true}
 },new Date('2026-10-20T00:00:00Z'))
 const imported=parseWorkspaceBackup(JSON.stringify(archive))
 assert.equal(imported.workspace.projects[0].icon,'rocket')
 assert.equal(imported.workspace.projects[0].instructions,'Answer in bullet points')
 assert.equal(imported.workspace.projects[0].files[0].content,'Private spec')
 assert.deepEqual(imported.workspace.projects[0].shareMemoryWith,['other'])
 assert.deepEqual(imported.workspace.projects[0].api,['github'])
})
