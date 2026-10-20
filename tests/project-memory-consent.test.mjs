import test from 'node:test'
import assert from 'node:assert/strict'
import {newProject,normalizeProject} from '../src/project-model.js'
import {projectContext} from '../src/project-context.js'

test('new and legacy projects have memory off by default',()=>{
 const fresh=newProject('p','Private')
 assert.equal(fresh.memoryEnabled,false)
 const legacy=normalizeProject({id:'old',name:'Old',memory:'Secret old notes'})
 assert.equal(legacy.memoryEnabled,false)
 assert.doesNotMatch(projectContext({projects:[legacy]},legacy.id,'secret'),/Secret old notes/)
})
test('toggling memory controls context without deleting stored notes',()=>{
 const project={...newProject('p','Private'),memory:'A retained private note'}
 assert.doesNotMatch(projectContext({projects:[project]},'p','note'),/retained private/)
 project.memoryEnabled=true
 assert.match(projectContext({projects:[project]},'p','note'),/retained private/)
 project.memoryEnabled=false
 assert.equal(project.memory,'A retained private note')
 assert.doesNotMatch(projectContext({projects:[project]},'p','note'),/retained private/)
})
test('sharing notes requires both source and destination memory enabled',()=>{
 const a={...newProject('a','Source'),memory:'Very sensitive note',shareMemoryWith:['b']}
 const b={...newProject('b','Destination'),memoryEnabled:true}
 assert.doesNotMatch(projectContext({projects:[a,b]},'b','sensitive'),/Very sensitive/)
 a.memoryEnabled=true
 assert.match(projectContext({projects:[a,b]},'b','sensitive'),/Very sensitive/)
 b.memoryEnabled=false
 assert.doesNotMatch(projectContext({projects:[a,b]},'b','sensitive'),/Very sensitive/)
})
