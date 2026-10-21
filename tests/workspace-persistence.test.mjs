import test from 'node:test'
import assert from 'node:assert/strict'
import {persistWorkspaceChange} from '../src/workspace-persistence.js'
import {newProject} from '../src/project-model.js'
import {projectContext} from '../src/project-context.js'

const blank={projects:[{...newProject('a','Alpha'),memoryEnabled:true,memory:'private note'}, {...newProject('b','Beta'),memoryEnabled:true,memory:'unrelated note'}],pinned:[],expanded:{}}
const clearAlpha=w=>({...w,projects:w.projects.map(p=>p.id==='a'?{...p,memory:''}:p)})
test('memory deletion persists before the UI may claim it succeeded',()=>{
 const map=new Map()
 const storage={setItem:(k,v)=>map.set(k,v)}
 const next=persistWorkspaceChange(storage,'workspace',blank,clearAlpha)
 assert.equal(next.projects[0].memory,'')
 assert.equal(next.projects[1].memory,'unrelated note')
 assert.equal(JSON.parse(map.get('workspace')).projects[0].memory,'')
 assert.doesNotMatch(projectContext(next,'a'),/private note/)
})
test('storage quota failure leaves both memory and persisted data untouched',()=>{
 const storage={setItem:()=>{throw Error('QuotaExceededError')}}
 let state=blank
 assert.throws(()=>{state=persistWorkspaceChange(storage,'workspace',state,clearAlpha)},/QuotaExceededError/)
 assert.equal(state.projects[0].memory,'private note')
 assert.equal(state.projects[1].memory,'unrelated note')
})
test('invalid updates fail without writing',()=>{
 let called=false
 const storage={setItem:()=>{called=true}}
 assert.throws(()=>persistWorkspaceChange(storage,'workspace',blank,()=>null),/Invalid workspace/)
 assert.equal(called,false)
})
