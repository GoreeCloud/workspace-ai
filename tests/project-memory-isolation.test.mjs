import test from 'node:test'
import assert from 'node:assert/strict'
import {newProject,normalizeProject,normalizeProjects} from '../src/project-model.js'
import {projectContext} from '../src/project-context.js'
import {createWorkspaceBackup,parseWorkspaceBackup} from '../src/workspace-backup.js'

test('each project owns a separate and editable memory store',()=>{
 const a={...newProject('a','Alpha'),memoryEnabled:true,memory:'Alpha secret'}
 const b={...newProject('b','Beta'),memoryEnabled:true,memory:'Beta secret'}
 const projects=normalizeProjects([a,b])
 assert.match(projectContext({projects},'a'),/Alpha secret/)
 assert.doesNotMatch(projectContext({projects},'a'),/Beta secret/)
 const updated=projects.map(p=>p.id==='a'?normalizeProject({...p,memory:'Alpha edited'}):p)
 assert.match(projectContext({projects:updated},'a'),/Alpha edited/)
 assert.doesNotMatch(projectContext({projects:updated},'a'),/Alpha secret/)
 assert.equal(updated[1].memory,'Beta secret')
 const deleted=updated.map(p=>p.id==='a'?normalizeProject({...p,memory:''}):p)
 assert.doesNotMatch(projectContext({projects:deleted},'a'),/Alpha edited/)
 assert.match(projectContext({projects:deleted},'b'),/Beta secret/)
})

test('disabled memory remains editable and deletable but cannot enter model context',()=>{
 const project=normalizeProject({...newProject('a','Alpha'),memory:'Legacy retained text',memoryEnabled:false})
 assert.equal(project.memory,'Legacy retained text')
 const edited=normalizeProject({...project,memory:'A revised note'})
 assert.equal(edited.memory,'A revised note')
 assert.doesNotMatch(projectContext({projects:[edited]},'a'),/revised/)
 const deleted=normalizeProject({...edited,memory:''})
 assert.equal(deleted.memory,'')
 assert.equal(projectContext({projects:[deleted]},'a'),'')
})

test('legacy cross-project memory flags cannot leak through normalizing or context generation',()=>{
 const source={...newProject('a','Alpha'),memoryEnabled:true,memory:'Do not expose',shareMemoryWith:['b']}
 const target={...newProject('b','Beta'),memoryEnabled:true}
 assert.doesNotMatch(projectContext({projects:[source,target]},'b'),/Do not expose/)
 const projects=normalizeProjects([source,target])
 assert.equal(Object.hasOwn(projects[0],'shareMemoryWith'),false)
 assert.doesNotMatch(projectContext({projects},'b'),/Do not expose/)
 const backup=createWorkspaceBackup([],{projects:[source,target],pinned:[],collapsed:false,expanded:{}})
 const restored=parseWorkspaceBackup(JSON.stringify(backup))
 assert.equal(Object.hasOwn(restored.workspace.projects[0],'shareMemoryWith'),false)
 assert.doesNotMatch(projectContext(restored.workspace,'b'),/Do not expose/)
})
