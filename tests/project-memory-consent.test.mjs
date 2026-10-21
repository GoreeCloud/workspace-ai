import test from 'node:test'
import assert from 'node:assert/strict'
import {newProject,normalizeProject} from '../src/project-model.js'
import {projectContext} from '../src/project-context.js'

test('new and legacy projects default to memory on while explicit opt-outs remain off',()=>{
 const fresh=newProject('p','Private')
 assert.equal(fresh.memoryEnabled,true)
 const legacy=normalizeProject({id:'old',name:'Old',memory:'Secret old notes'})
 assert.equal(legacy.memoryEnabled,true)
 assert.match(projectContext({projects:[legacy]},legacy.id,'secret'),/Secret old notes/)
 const disabled=normalizeProject({...legacy,memoryEnabled:false})
 assert.doesNotMatch(projectContext({projects:[disabled]},disabled.id,'secret'),/Secret old notes/)
})
test('toggling memory controls context without deleting stored notes',()=>{
 const project={...newProject('p','Private'),memoryEnabled:false,memory:'A retained private note'}
 assert.doesNotMatch(projectContext({projects:[project]},'p','note'),/retained private/)
 project.memoryEnabled=true
 assert.match(projectContext({projects:[project]},'p','note'),/retained private/)
 project.memoryEnabled=false
 assert.equal(project.memory,'A retained private note')
 assert.doesNotMatch(projectContext({projects:[project]},'p','note'),/retained private/)
})
test('cross-project memory never flows even when old sharing flags exist',()=>{
 const a={...newProject('a','Source'),memory:'Very sensitive note',shareMemoryWith:['b'],memoryEnabled:true}
 const b={...newProject('b','Destination'),memoryEnabled:true}
 assert.doesNotMatch(projectContext({projects:[a,b]},'b','sensitive'),/Very sensitive/)
 assert.match(projectContext({projects:[a,b]},'a','sensitive'),/Very sensitive/)
 a.memoryEnabled=false
 assert.doesNotMatch(projectContext({projects:[a,b]},'a','sensitive'),/Very sensitive/)
})
