import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import {createHostedCredentialSessions} from '../server/hosted-credential-sessions.mjs'
import {attachCredentialSettings} from '../server/credential-settings.mjs'

const ORIGIN='https://workspace-ai-dev.goreecloud.com'
const testKey='synthetic-credentials-never-leave-local-test'
const bootstrap=(sessions)=>{
  const headers={}
  const res={setHeader:(name,value)=>{headers[name]=value}}
  sessions.begin({headers:{}},res)
  return headers['Set-Cookie'].split(';')[0]
}
const wait=async(predicate)=>{
  for(let i=0;i<100;i++){
    if(predicate())return
    await new Promise(resolve=>setTimeout(resolve,10))
  }
  throw Error('Synthetic verification did not start')
}
test('concurrent verifications cannot cross browser sessions or race a key rotation', {timeout:10000}, async()=>{
  let clock=0
  const sessions=createHostedCredentialSessions({now:()=>clock,idleMs:1000,lifetimeMs:3000})
  const a=bootstrap(sessions),b=bootstrap(sessions)
  const pending=[]
  const app=express()
  app.use(express.json())
  const manager=attachCredentialSettings(app,{
    allowedOrigins:new Set([ORIGIN]),
    sessionForRequest:req=>sessions.find(req),
    getCredential:req=>sessions.find(req)?.key||'',
    setCredential:(key,req)=>{sessions.find(req).key=key},
    clearCredential:req=>{sessions.find(req).key=''},
    verifyCredential:key=>new Promise(resolve=>pending.push({key,resolve}))
  })
  const listener=await new Promise(resolve=>{
    const s=app.listen(0,'127.0.0.1',()=>resolve(s))
  })
  const url='http://127.0.0.1:'+listener.address().port+'/api/settings/credential'
  const post=(route,cookie,body)=>fetch(url+route,{
    method:'POST',headers:{Origin:ORIGIN,Cookie:cookie,'Content-Type':'application/json'},
    ...(body?{body:JSON.stringify(body)}:{})
  })
  try{
    assert.equal((await post('',a,{key:testKey+'-A'})).status,200)
    assert.equal((await post('',b,{key:testKey+'-B'})).status,200)
    const verifyingA=post('/verify',a)
    await wait(()=>pending.length===1)
    assert.equal(pending[0].key,testKey+'-A')
    assert.equal((await post('',a,{key:testKey+'-A-new'})).status,200)
    pending[0].resolve({state:'verified',message:'Synthetic success'})
    assert.equal((await verifyingA).status,409,'rotation invalidates old verification')
    assert.equal(manager.getVerification({headers:{cookie:a}}).state,'untested')
    const verifyingB=post('/verify',b)
    await wait(()=>pending.length===2)
    assert.equal(pending[1].key,testKey+'-B')
    pending[1].resolve({state:'verified',message:'Synthetic success'})
    assert.equal((await verifyingB).status,200)
    assert.equal(manager.getVerification({headers:{cookie:b}}).state,'verified')
    assert.equal(manager.getVerification({headers:{cookie:a}}).state,'untested')
    const expiring=post('/verify',a)
    await wait(()=>pending.length===3)
    clock=3000
    pending[2].resolve({state:'verified',message:'Too late'})
    assert.equal((await expiring).status,409,'expiry invalidates late verification')
    assert.equal(manager.getVerification({headers:{cookie:a}}).state,'untested')
    assert.equal(manager.getVerification({headers:{cookie:b}}).state,'untested','expired sessions discard state')
  }finally{
    await new Promise(resolve=>listener.close(resolve))
  }
})
