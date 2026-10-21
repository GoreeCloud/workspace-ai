import test from 'node:test'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {request as httpRequest} from 'node:http'
import {createServer} from 'node:net'
import {mkdtemp,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {resolveIngress} from '../server/ingress-config.mjs'

const DEV = 'https://workspace-ai-dev.goreecloud.com'
const config = (overrides = {}) => resolveIngress({WORKSPACE_AI_PORT: '3031', ...overrides})

test('local installations remain loopback-bound and reject development settings', () => {
  const normal = config()
  assert.equal(normal.bindHost, '127.0.0.1')
  assert.equal(normal.clientOrigin, 'http://127.0.0.1:3031')
  assert.deepEqual([...normal.allowedHosts], ['127.0.0.1:3031'])
  assert.equal(normal.allowedOrigins.has('http://127.0.0.1:5173'), true)
  assert.throws(() => config({WORKSPACE_AI_PRIVATE_DEV_ORIGIN: DEV}), /require/)
  assert.throws(() => config({WORKSPACE_AI_PORT: '-1'}), /Invalid/)
  assert.throws(() => config({WORKSPACE_AI_PORT: '65536'}), /Invalid/)
})

test('private host requires an exact HTTPS origin and explicit opt-in', () => {
  const base = {WORKSPACE_AI_PRIVATE_DEV_ENABLED: 'true', WORKSPACE_AI_PRIVATE_DEV_ORIGIN: DEV}
  assert.throws(() => config({...base, WORKSPACE_AI_PRIVATE_DEV_ORIGIN: 'http://workspace-ai-dev.goreecloud.com'}), /approved HTTPS/)
  assert.throws(() => config({...base, WORKSPACE_AI_PRIVATE_DEV_ORIGIN: 'https://workspace-ai-dev.goreecloud.com.evil.test'}), /approved HTTPS/)
  assert.throws(() => config({...base, WORKSPACE_AI_PRIVATE_DEV_BIND_ALL: 'true'}), /isolated container/)
  assert.throws(() => config({...base, WORKSPACE_AI_PRIVATE_DEV_BIND_ALL: 'yes'}), /Invalid/)
  const enabled = config(base)
  assert.equal(enabled.bindHost, '127.0.0.1')
  assert.equal(enabled.clientOrigin, DEV)
  assert.deepEqual([...enabled.allowedHosts], ['workspace-ai-dev.goreecloud.com'])
  assert.deepEqual([...enabled.allowedOrigins], [DEV])
  const isolated = config({...base, WORKSPACE_AI_PRIVATE_DEV_BIND_ALL: 'true', WORKSPACE_AI_PRIVATE_DEV_ISOLATED_CONTAINER: 'true'})
  assert.equal(isolated.bindHost, '0.0.0.0')
})

function send(port, host, method = 'GET', origin, route = '/api/status', body) {
  return new Promise((resolve,reject) => {
    const headers = {Host:host}
    if (origin !== undefined) headers.Origin = origin
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    const req = httpRequest({host:'127.0.0.1',port,method,path:route,headers}, res => {
      const data=[]
      res.on('data',chunk=>data.push(chunk))
      res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(data).toString('utf8')}))
    })
    req.on('error',reject)
    req.setTimeout(2000,()=>req.destroy(Error('request timed out')))
    req.end(body)
  })
}

test('private development origin is enforced by the real server before API handlers', {timeout:20000}, async () => {
  const home=await mkdtemp(path.join(os.tmpdir(),'workspace-ai-private-dev-'))
  const socket=createServer()
  let child
  try {
    await new Promise((resolve,reject)=>socket.once('error',reject).listen(0,'127.0.0.1',resolve))
    const port=socket.address().port
    await new Promise(resolve=>socket.close(resolve))
    const env={...process.env,HOME:home,WORKSPACE_AI_PORT:String(port),
      WORKSPACE_AI_PRIVATE_DEV_ENABLED:'true', WORKSPACE_AI_PRIVATE_DEV_ORIGIN:DEV,
      WORKSPACE_AI_PRIVATE_DEV_BIND_ALL:'false', WORKSPACE_AI_ENABLE_SCHEDULED_AGENTS:'false'}
    for (const key of ['OPENAI_API_KEY','WORKSPACE_AI_AGENT_OWNER_KEY','WORKSPACE_SYNC_OAUTH_CLIENT_IDS']) delete env[key]
    child=spawn(process.execPath,[fileURLToPath(new URL('../server/index.mjs',import.meta.url))],{env,cwd:home,stdio:'ignore'})
    let ready=false
    for(let i=0;i<90;i++){
      if(child.exitCode!==null) throw Error('Development server exited before startup')
      try{if((await send(port,'workspace-ai-dev.goreecloud.com')).status===200){ready=true;break}}catch{}
      await new Promise(resolve=>setTimeout(resolve,80))
    }
    assert.equal(ready,true,'Development server did not become ready')
    const status=await send(port,'workspace-ai-dev.goreecloud.com')
    assert.equal(status.status,200)
    assert.match(status.headers['cache-control'],/no-store/)
    assert.match(status.headers['content-security-policy'],/frame-ancestors 'none'/)
    assert.equal((await send(port,'127.0.0.1:'+port)).status,403)
    assert.equal((await send(port,'workspace-ai-dev.goreecloud.com.attacker.invalid')).status,403)
    assert.equal((await send(port,'workspace-ai-dev.goreecloud.com','POST',undefined,'/api/chat','{}')).status,403)
    assert.equal((await send(port,'workspace-ai-dev.goreecloud.com','POST','https://attacker.invalid','/api/chat','{}')).status,403)
    assert.equal((await send(port,'workspace-ai-dev.goreecloud.com','POST',DEV,'/api/chat','{}')).status,400)
  }finally{
    if(socket.listening)await new Promise(resolve=>socket.close(resolve))
    if(child && child.exitCode===null){
      child.kill('SIGTERM')
      await new Promise(resolve=>{
        const timeout=setTimeout(()=>child.kill('SIGKILL'),1000)
        child.once('exit',()=>{clearTimeout(timeout);resolve()})
      })
    }
    await rm(home,{recursive:true,force:true})
  }
})
