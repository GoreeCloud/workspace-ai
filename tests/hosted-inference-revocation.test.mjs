import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import {createHostedCredentialSessions, cancelHostedSessionRequests} from '../server/hosted-credential-sessions.mjs'
import {attachCredentialSettings} from '../server/credential-settings.mjs'

const origin='https://workspace-ai-dev.goreecloud.com'
function bootstrap(sessions){
  const headers={}
  sessions.begin({headers:{}},{setHeader:(name,value)=>{headers[name]=value}})
  return headers['Set-Cookie'].split(';')[0]
}
test('key replacement and clearing abort only the matching browser inference',async()=>{
  const sessions=createHostedCredentialSessions()
  const a=bootstrap(sessions),b=bootstrap(sessions)
  const find=cookie=>sessions.find({headers:{cookie}})
  const app=express()
  app.use(express.json())
  attachCredentialSettings(app,{
    allowedOrigins:new Set([origin]),
    sessionForRequest:req=>sessions.find(req),
    getCredential:req=>sessions.find(req)?.key||'',
    setCredential:(value,req)=>{
      const session=sessions.find(req)
      cancelHostedSessionRequests(session)
      session.key=value
    },
    clearCredential:req=>{
      const session=sessions.find(req)
      cancelHostedSessionRequests(session)
      session.key=''
    },
    verifyCredential:async()=>({state:'verified'})
  })
  const listener=await new Promise(resolve=>{
    const server=app.listen(0,'127.0.0.1',()=>resolve(server))
  })
  const url='http://127.0.0.1:'+listener.address().port+'/api/settings/credential'
  const call=(method,cookie,key)=>fetch(url,{
    method,headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},
    ...(key?{body:JSON.stringify({key})}:{})
  })
  try{
    assert.equal((await call('POST',a,'synthetic-key-for-browser-A')).status,200)
    assert.equal((await call('POST',b,'synthetic-key-for-browser-B')).status,200)
    const aOld=new AbortController(),bRunning=new AbortController()
    find(a).activeRequests.add(aOld)
    find(b).activeRequests.add(bRunning)
    assert.equal((await call('POST',a,'synthetic-rotated-browser-A')).status,200)
    assert.equal(aOld.signal.aborted,true)
    assert.equal(bRunning.signal.aborted,false)
    assert.equal(find(a).activeRequests.size,0)
    assert.equal(find(b).activeRequests.size,1)
    const aNew=new AbortController()
    find(a).activeRequests.add(aNew)
    assert.equal((await call('DELETE',a)).status,200)
    assert.equal(aNew.signal.aborted,true)
    assert.equal(bRunning.signal.aborted,false)
    assert.equal(find(a).key,'')
    assert.equal(find(b).key,'synthetic-key-for-browser-B')
    const bSecond=new AbortController()
    find(b).activeRequests.add(bSecond)
    assert.equal((await call('DELETE',b)).status,200)
    assert.equal(bRunning.signal.aborted,true)
    assert.equal(bSecond.signal.aborted,true)
    assert.equal(find(b).activeRequests.size,0)
    assert.equal(find(b).key,'')
  }finally{
    await new Promise(resolve=>listener.close(resolve))
  }
})

test('absolute expiry aborts active inference and makes the old session unusable',()=>{
  let clock=0
  const sessions=createHostedCredentialSessions({now:()=>clock,idleMs:50,lifetimeMs:100})
  const cookie=bootstrap(sessions)
  const request={headers:{cookie}}
  const session=sessions.find(request)
  session.key='synthetic-ephemeral-credential'
  const controller=new AbortController()
  session.activeRequests.add(controller)
  clock=100
  assert.equal(sessions.find(request),null)
  assert.equal(controller.signal.aborted,true)
  assert.equal(session.key,'')
  assert.equal(session.activeRequests.size,0)
})
