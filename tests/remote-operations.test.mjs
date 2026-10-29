import test from 'node:test'
import assert from 'node:assert/strict'
import {
 validateRemoteConfig,sshArguments,validateBrowserArguments,createOperationsBroker
} from '../server/remote-operations-core.mjs'
import {proposeRemoteOperation} from '../server/remote-operations-planner.mjs'

const fixture={devices:[{
 id:'test-box',label:'Isolated test server',host:'example.org',user:'operator',port:2222,
 keyFile:'/private/ssh/id_ed25519',knownHostsFile:'/private/ssh/known_hosts',
 commands:[{id:'health',label:'Read uptime',command:'uptime',mode:'read',risk:'medium'},
 {id:'restart',label:'Restart example',command:'systemctl restart dummy',mode:'write',risk:'critical'}]
}]}
const broker=(changes={})=>createOperationsBroker({
 ownerKey:'owner-secret-with-at-least-thirty-two-characters',
 config:fixture,enabled:true,writesEnabled:true,
 runSsh:async(_d,cmd)=>({exitCode:0,output:cmd}),
 ...changes
})
const approve=(b,t,extra={})=>b.approve({id:t.id,digest:t.digest,confirmation:'APPROVE',...extra})

test('private device catalog validates and strips unknown fields',()=>{
 const validated=validateRemoteConfig(fixture)
 assert.equal(validated.devices[0].commands[0].command,'uptime')
 assert.equal(validated.devices[0].host,'example.org')
})
test('duplicate devices cannot be authorized',()=>assert.throws(()=>validateRemoteConfig({devices:[fixture.devices[0],fixture.devices[0]]})))
test('unapproved user command types are rejected',()=>assert.throws(()=>validateRemoteConfig({devices:[{...fixture.devices[0],commands:[{id:'bad',label:'bad',command:'rm -rf /',mode:'write',risk:'medium'}]}]})))
test('SSH always checks trusted host keys and forbids interactive forwarding',()=>{
 const args=sshArguments(fixture.devices[0],'uptime')
 for(const flag of ['StrictHostKeyChecking=yes','BatchMode=yes','ForwardAgent=no','ClearAllForwardings=yes'])assert.ok(args.includes(flag))
 assert.equal(args.at(-1),'uptime')
 assert.equal(args.includes('operator@example.org'),true)
})
test('browser navigation allows exact HTTPS host only',()=>{
 assert.deepEqual(validateBrowserArguments('new_page',{url:'https://example.org/path'},{allowedHosts:['example.org']}),{url:'https://example.org/path'})
 for(const url of ['http://example.org','https://localhost','https://127.0.0.1','https://evil.example.org','https://example.org:8443','https://example.org/#x'])assert.throws(()=>validateBrowserArguments('new_page',{url},{allowedHosts:['example.org']}))
})
test('browser tools forbid unexpected keys and scripts',()=>{
 assert.throws(()=>validateBrowserArguments('evaluate_script',{function:'1+1'}))
 assert.throws(()=>validateBrowserArguments('take_snapshot',{pageId:1,filePath:'/tmp/a'}))
 assert.throws(()=>validateBrowserArguments('fill',{pageId:1,uid:'x',value:'a'.repeat(1001)}))
 assert.deepEqual(validateBrowserArguments('click',{pageId:4,uid:'node-1'}),{pageId:4,uid:'node-1'})
})
test('remote operation fails closed without enable switch and owner key',()=>{
 assert.throws(()=>createOperationsBroker({config:fixture}).stage({kind:'ssh',target:'test-box',action:'health'}))
 const b=broker({enabled:false})
 assert.throws(()=>b.stage({kind:'ssh',target:'test-box',action:'health'}))
})
test('owner key must be correct',()=>{
 const b=broker()
 assert.throws(()=>b.authenticate('Bearer wrong'),{status:401})
 b.authenticate('Bearer owner-secret-with-at-least-thirty-two-characters')
})
test('arbitrary shell commands never become catalog actions',()=>{
 const b=broker()
 assert.throws(()=>b.stage({kind:'ssh',target:'test-box',action:'rm -rf /'}),{status:403})
})
test('read operations require stage, approval, and an independent execute call',async()=>{
 const b=broker(),t=b.stage({kind:'ssh',target:'test-box',action:'health'})
 await assert.rejects(()=>b.execute({id:t.id,digest:t.digest}),{status:403})
 approve(b,t)
 const r=await b.execute({id:t.id,digest:t.digest})
 assert.equal(r.result.output,'uptime')
 await assert.rejects(()=>b.execute({id:t.id,digest:t.digest}),{status:409})
})
test('critical actions need separate confirmation',async()=>{
 const b=broker(),t=b.stage({kind:'ssh',target:'test-box',action:'restart'})
 assert.throws(()=>approve(b,t),{status:403})
 approve(b,t,{criticalConfirmation:'CONFIRM CRITICAL'})
 const r=await b.execute({id:t.id,digest:t.digest})
 assert.equal(r.action,'restart')
})
test('disabled writes reject catalog write operations',()=>assert.throws(()=>broker({writesEnabled:false}).stage({kind:'ssh',target:'test-box',action:'restart'}),{status:409}))
test('approved actions expire and cannot be replayed',async()=>{
 let time=100
 const b=broker({now:()=>time}),t=b.stage({kind:'ssh',target:'test-box',action:'health'})
 approve(b,t);time+=300001
 await assert.rejects(()=>b.execute({id:t.id,digest:t.digest}),{status:409})
})
test('execution failure consumes approval',async()=>{
 const b=broker({runSsh:async()=>{throw Error('private diagnostic')}})
 const t=b.stage({kind:'ssh',target:'test-box',action:'health'})
 approve(b,t)
 await assert.rejects(()=>b.execute({id:t.id,digest:t.digest}),{status:502})
 await assert.rejects(()=>b.execute({id:t.id,digest:t.digest}),{status:409})
 assert.ok(b.history().some(e=>e.event==='failed'))
})
test('revoking staged actions prevents execution',async()=>{
 const b=broker(),t=b.stage({kind:'ssh',target:'test-box',action:'health'})
 approve(b,t);b.revoke()
 await assert.rejects(()=>b.execute({id:t.id,digest:t.digest}),{status:409})
})
test('Chrome tool stays within reviewed catalog',async()=>{
 const b=broker({chromeReady:true,browserTools:[{name:'take_snapshot',mode:'read',risk:'medium'}],runBrowser:async(name,args)=>({name,args})})
 assert.throws(()=>b.stage({kind:'chrome',target:'isolated-chrome',action:'evaluate_script',args:{}}),{status:403})
 const t=b.stage({kind:'chrome',target:'isolated-chrome',action:'take_snapshot',args:{pageId:1}})
 approve(b,t)
 const r=await b.execute({id:t.id,digest:t.digest})
 assert.deepEqual(r.result,{name:'take_snapshot',args:{pageId:1}})
})
test('AI suggests an exact catalog ID but cannot execute it',async()=>{
 const b=broker(),catalog=b.list()
 const request=async()=>({ok:true,json:async()=>({output_text:JSON.stringify({kind:'ssh',target:'test-box',action:'health',args:{},explanation:'Read uptime.'})})})
 const result=await proposeRemoteOperation({task:'Check uptime on this device',catalog,key:'test-api-key',request})
 assert.equal(result.proposal.action,'health')
 assert.equal(result.requiresManualApproval,true)
})
test('AI inventing a new command is rejected before staging',async()=>{
 const request=async()=>({ok:true,json:async()=>({output_text:JSON.stringify({kind:'ssh',target:'test-box',action:'arbitrary',args:{},explanation:'Unknown.'})})})
 await assert.rejects(()=>proposeRemoteOperation({task:'Run arbitrary remote command',catalog:broker().list(),key:'test-key',request}),{status:502})
})
