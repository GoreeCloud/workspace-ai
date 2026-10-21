import test from 'node:test'
import assert from 'node:assert/strict'
import {createEngineeringWorkOrder} from '../src/engineering-work-order.js'
import {proposeEngineeringAgentTeam} from '../src/engineering-team.js'

test('engineering team has four project-isolated non-executing roles',()=>{
 const workspace={projects:[{id:'project1',name:'Workspace AI'},{id:'project2',name:'Other'}],agents:[]}
 const order=createEngineeringWorkOrder({repository:'GoreeCloud/workspace-ai',target:'linux',
  goal:'Implement native Linux features, run QA and verify release artifacts.',project:'Workspace AI',projectId:'project1'})
 const team=proposeEngineeringAgentTeam(workspace,order,'project1')
 assert.equal(team.length,4)
 assert.deepEqual(team.map(a=>a.role),['research','developer','reviewer','coordinator'])
 assert.ok(team.every(a=>a.projectId==='project1'&&a.instructions.includes('Never claim to have executed tools')))
 assert.deepEqual(workspace.agents,[])
 assert.throws(()=>proposeEngineeringAgentTeam(workspace,order,'project2'),/project changed/)
 assert.throws(()=>proposeEngineeringAgentTeam({...workspace,agents:team},order,'project1'),/already exists/)
 assert.throws(()=>proposeEngineeringAgentTeam({...workspace,agents:Array.from({length:60},(_,i)=>({...team[0],id:'agent'+i,name:'Custom '+i}))},order,'project1'),/capacity/)
})
