import test from 'node:test'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {createServer} from 'node:net'
import {request} from 'node:http'
import {mkdtemp,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const origin='https://workspace-ai-dev.goreecloud.com'
const host='workspace-ai-dev.goreecloud.com'
const app=fileURLToPath(new URL('../server/index.mjs',import.meta.url))
const shim=fileURLToPath(new URL('./fake-pending-provider.mjs',import.meta.url))
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))

test('real private chat requests abort on own browser key clear, not a different browser', {timeout:14000},async()=>{
  const home=await mkdtemp(path.join(os.tmpdir(),'gcwa-chat-revoke-'))
  const portProbe=createServer()
  let server=null
  try{
    await new Promise(resolve=>portProbe.listen(0,'127.0.0.1',resolve))
    const port=portProbe.address().port
    await new Promise(resolve=>portProbe.close(resolve))
    const env={...process.env,
      HOME:home,WORKSPACE_AI_PORT:String(port),
      WORKSPACE_AI_PRIVATE_DEV_ENABLED:'true',
      WORKSPACE_AI_PRIVATE_DEV_ORIGIN:origin,
      WORKSPACE_AI_PRIVATE_DEV_BIND_ALL:'false',
      WORKSPACE_AI_ENABLE_SCHEDULED_AGENTS:'false',
      NODE_USE_ENV_PROXY:'1',
      HTTPS_PROXY:'http://provider-proxy:3128',
      OPENAI_API_KEY:'synthetic-must-not-be-used-global-key',
      NODE_OPTIONS:'--import='+shim
    }
    for(const key of ['WORKSPACE_AI_PRIVATE_GATEWAY_TOKEN',
      'WORKSPACE_AI_PRIVATE_GATEWAY_TOKEN_FILE','WORKSPACE_AI_AGENT_OWNER_KEY']) delete env[key]
    server=spawn(process.execPath,[app],{cwd:home,env,stdio:'ignore'})
    const send=(route,method='GET',cookie,body)=>new Promise((resolve,reject)=>{
      const data=body?Buffer.from(JSON.stringify(body)):null
      const headers={Host:host,...(cookie?{Cookie:cookie}:{}),
        ...(method!=='GET'?{Origin:origin}:{}),
        ...(data?{'Content-Type':'application/json','Content-Length':data.length}:{})}
      const req=request({host:'127.0.0.1',port,path:route,method,headers},res=>{
        const chunks=[]
        res.on('data',chunk=>chunks.push(chunk))
        res.on('end',()=>{
          const raw=Buffer.concat(chunks).toString('utf8')
          resolve({status:res.statusCode,cookie:res.headers['set-cookie']?.[0]||'',
            body:raw})
        })
      })
      req.setTimeout(4000,()=>req.destroy(new Error('Synthetic chat timed out')))
      req.on('error',reject)
      req.end(data)
    })
    let ready=false
    for(let i=0;i<75;i++){
      if(server.exitCode!==null)throw Error('Synthetic app exited')
      try{if((await send('/api/status')).status===200){ready=true;break}}catch{}
      await delay(60)
    }
    assert.equal(ready,true,'private server started')
    const first=await send('/api/status?bootstrap=1')
    const second=await send('/api/status?bootstrap=1')
    const a=first.cookie.split(';')[0],b=second.cookie.split(';')[0]
    assert.notEqual(a,b)
    const setKey=(cookie,key)=>send('/api/settings/credential','POST',cookie,{key})
    const clearKey=cookie=>send('/api/settings/credential','DELETE',cookie)
    assert.equal((await setKey(a,'synthetic-browser-A-inference-key')).status,200)
    assert.equal((await setKey(b,'synthetic-browser-B-inference-key')).status,200)
    const body={messages:[{role:'user',content:'synthetic reply'}],preference:'api'}
    const pendingA=send('/api/chat','POST',a,body)
    const pendingB=send('/api/chat','POST',b,body)
    await delay(120)
    assert.equal((await clearKey(a)).status,200)
    const stoppedA=await pendingA
    assert.equal(stoppedA.status,502,'A inference cancels when A key cleared')
    assert.match(stoppedA.body,/Request cancelled/)
    const bWasPending=await Promise.race([pendingB.then(()=>false,()=>false),delay(100).then(()=>true)])
    assert.equal(bWasPending,true,'A clear must not interrupt browser B')
    assert.equal((await clearKey(b)).status,200)
    const stoppedB=await pendingB
    assert.equal(stoppedB.status,502)
    assert.match(stoppedB.body,/Request cancelled/)
  }finally{
    if(portProbe.listening)await new Promise(resolve=>portProbe.close(resolve))
    if(server && server.exitCode===null){
      server.kill('SIGTERM')
      await new Promise(resolve=>{
        const kill=setTimeout(()=>server.kill('SIGKILL'),1500)
        server.once('exit',()=>{clearTimeout(kill);resolve()})
      })
    }
    await rm(home,{recursive:true,force:true})
  }
})
