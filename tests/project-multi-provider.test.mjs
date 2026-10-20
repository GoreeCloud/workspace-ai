import test from 'node:test'
import assert from 'node:assert/strict'
import {projectProviderReadiness,plannedWorkflowReadiness,readSelectedProviders} from '../src/project-multi-provider.js'
const selected={api:['github','todoist','gmail','google-drive'],mcp:['firecrawl']}
const services=[
 {id:'github',connected:true,hasSessionToken:true},
 {id:'todoist',connected:true,hasSessionToken:true},
 {id:'gmail',connected:false,auth:'oauth'},
 {id:'google-drive',connected:false,auth:'oauth'}
]
test('read readiness is scoped to enabled and verified project providers',()=>{
 const status=projectProviderReadiness(selected,services)
 assert.deepEqual(status.map(s=>s.ready),[true,true])
 assert.deepEqual(projectProviderReadiness({api:['github']},services).map(s=>s.ready),[true,false])
 assert.deepEqual(projectProviderReadiness(selected,[{id:'github',connected:true,hasSessionToken:false}]).map(s=>s.ready),[false,false])
})
test('read overview queries authorized GitHub and Todoist independently and concurrently',async()=>{
 const pending=[]
 const fetcher=(url,options)=>{
  assert.equal(options.method,'GET')
  assert.equal(options.redirect,'error')
  pending.push(url)
  return Promise.resolve({ok:true,json:async()=>url.includes('github')?
   {readOnly:true,results:[{name:'workspace-ai',private:true,token:'should-not-be-displayed'}]}:
   {readOnly:true,results:[{content:'Review current issues',secret:'hidden'}]}})
 }
 const result=await readSelectedProviders({project:selected,services,fetcher})
 assert.equal(pending.length,2)
 assert.ok(pending.every(url=>url.startsWith('/api/integrations/')))
 assert.equal(result.every(r=>r.status==='success'),true)
 assert.deepEqual(result[0].records,['workspace-ai'])
 assert.deepEqual(result[1].records,['Review current issues'])
 assert.ok(!JSON.stringify(result).includes('should-not-be-displayed'))
 assert.ok(!JSON.stringify(result).includes('hidden'))
})
test('partial provider failures do not hide other read results or retry writes',async()=>{
 let calls=0
 const result=await readSelectedProviders({project:selected,services,fetcher:async url=>{
  calls++
  if(url.includes('github'))return {ok:false,status:403,json:async()=>({error:'no'})}
  return {ok:true,json:async()=>({readOnly:true,results:[{content:'Safe'}]})}
 }})
 assert.equal(calls,2)
 assert.equal(result[0].status,'error')
 assert.equal(result[1].status,'success')
 assert.deepEqual(result[1].records,['Safe'])
})
test('unselected providers cannot trigger reads',async()=>{
 let calls=0
 const output=await readSelectedProviders({project:{api:[]},services,fetcher:async()=>{calls++;throw Error('unexpected')}})
 assert.deepEqual(output,[])
 assert.equal(calls,0)
})
test('four-step Gmail/GitHub/Todoist/Drive plan does not claim write or OAuth availability',()=>{
 const steps=plannedWorkflowReadiness(selected,services)
 assert.deepEqual(steps.map(s=>s.provider),['gmail','github','todoist','google-drive'])
 assert.deepEqual(steps.map(s=>s.mode),['read','read','write','write'])
 assert.equal(steps.every(s=>s.executable===false),true)
 assert.equal(steps.every(s=>s.implemented===false),true)
 assert.match(steps[0].reason,/not implemented/)
 assert.match(steps[2].reason,/not implemented/)
 assert.match(steps[3].reason,/not implemented/)
})
