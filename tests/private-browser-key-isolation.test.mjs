import test from 'node:test'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {createServer} from 'node:net'
import {request as httpRequest} from 'node:http'
import {mkdtemp,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const ORIGIN='https://workspace-ai-dev.goreecloud.com'
const HOST='workspace-ai-dev.goreecloud.com'
const appFile=fileURLToPath(new URL('../server/index.mjs',import.meta.url))
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))

test('two hosted browser cookie jars never share API keys or verification status', {timeout:20000}, async () => {
  const home=await mkdtemp(path.join(os.tmpdir(),'gcwa-browser-isolation-'))
  const probe=createServer()
  let server
  try {
    await new Promise((resolve,reject)=>probe.once('error',reject).listen(0,'127.0.0.1',resolve))
    const port=probe.address().port
    await new Promise(resolve=>probe.close(resolve))
    const env={...process.env,
      HOME:home,WORKSPACE_AI_PORT:String(port),
      WORKSPACE_AI_PRIVATE_DEV_ENABLED:'true',
      WORKSPACE_AI_PRIVATE_DEV_ORIGIN:ORIGIN,
      WORKSPACE_AI_PRIVATE_DEV_BIND_ALL:'false',
      WORKSPACE_AI_ENABLE_SCHEDULED_AGENTS:'false',
      OPENAI_API_KEY:'synthetic-global-must-never-leak-12345',
      NODE_USE_ENV_PROXY:'1',
      HTTPS_PROXY:'http://provider-proxy:3128'
    }
    for(const key of ['WORKSPACE_AI_PRIVATE_GATEWAY_TOKEN','WORKSPACE_AI_PRIVATE_GATEWAY_TOKEN_FILE',
      'WORKSPACE_AI_AGENT_OWNER_KEY','WORKSPACE_SYNC_OAUTH_CLIENT_IDS']) delete env[key]
    server=spawn(process.execPath,[appFile],{cwd:home,env,stdio:'ignore'})
    const send=(route,method='GET',cookie,body,origin,extraHeaders={})=>new Promise((resolve,reject)=>{
      const payload=body===undefined?null:Buffer.from(JSON.stringify(body))
      const headers={Host:HOST,...extraHeaders,...(cookie?{Cookie:cookie}:{}),
        ...(origin?{Origin:origin}:{}),
        ...(payload?{'Content-Type':'application/json','Content-Length':payload.length}:{})}
      const req=httpRequest({host:'127.0.0.1',port,method,path:route,headers},res=>{
        const chunks=[]
        res.on('data',chunk=>chunks.push(chunk))
        res.on('end',()=>{
          const raw=Buffer.concat(chunks).toString('utf8')
          resolve({status:res.statusCode,headers:{get:name=>{const value=res.headers[name.toLowerCase()];return Array.isArray(value)?value[0]:value||null}},
            json:async()=>JSON.parse(raw),text:async()=>raw})
        })
      })
      req.on('error',reject)
      req.setTimeout(3000,()=>req.destroy(Error('Request timed out')))
      req.end(payload)
    })
    let ready=false, lastStatus='unreachable'
    for(let i=0;i<90;i++){
      if(server.exitCode!==null)throw Error('Hosted test server stopped before startup')
      try{const response=await send('/api/status');lastStatus=response.status+' '+(await response.text()).slice(0,90);if(response.status===200){ready=true;break}}catch(e){lastStatus=e?.cause?.code||e?.code||'fetch-error'}
      await delay(80)
    }
    assert.equal(ready,true,'test server started; last result: '+lastStatus)
    const health=await send('/api/status')
    assert.equal(health.status,200)
    assert.equal(health.headers.get('set-cookie'),null,'health probes cannot create browser sessions')
    assert.equal((await health.json()).apiConfigured,false)
    const crossSite=await send('/api/status?bootstrap=1','GET',undefined,undefined,undefined,{'Sec-Fetch-Site':'cross-site'})
    assert.equal(crossSite.status,403)
    assert.equal(crossSite.headers.get('set-cookie'),null)
    const aBoot=await send('/api/status?bootstrap=1'),bBoot=await send('/api/status?bootstrap=1')
    assert.equal(aBoot.status,200)
    assert.equal(bBoot.status,200)
    const cookieA=aBoot.headers.get('set-cookie')?.split(';')[0]
    const cookieB=bBoot.headers.get('set-cookie')?.split(';')[0]
    assert.match(cookieA||'',/^__Host-gcwa-browser=[A-Za-z0-9_-]{43}$/)
    assert.notEqual(cookieA,cookieB)
    assert.match(aBoot.headers.get('set-cookie'),/; Secure; HttpOnly; SameSite=Strict/)
    assert.equal((await aBoot.json()).apiConfigured,false,'server-wide environment key is suppressed')
    assert.equal((await bBoot.json()).apiConfigured,false)
    const state=async cookie=>(await (await send('/api/status','GET',cookie)).json())
    const keyA='synthetic-A-browser-key-00000001',keyB='synthetic-B-browser-key-00000002'
    const saved=await send('/api/settings/credential','POST',cookieA,{key:keyA},ORIGIN)
    assert.equal(saved.status,200)
    assert.ok(!(await saved.text()).includes(keyA))
    assert.equal((await state(cookieA)).apiConfigured,true)
    assert.equal((await state(cookieB)).apiConfigured,false)
    assert.equal((await state(cookieA)).apiKeySource,'session')
    assert.equal((await state(cookieB)).apiKeySource,null)
    assert.equal((await (await send('/api/models','GET',cookieB)).json()).apiModel,null)
    assert.ok((await (await send('/api/models','GET',cookieA)).json()).apiModel)
    assert.equal((await send('/api/settings/credential','DELETE',undefined,undefined,ORIGIN)).status,409)
    assert.equal((await send('/api/settings/credential','POST',undefined,{key:keyB},ORIGIN)).status,409)
    assert.equal((await send('/api/settings/credential','POST',cookieB,{key:keyB},'https://attacker.invalid')).status,403)
    assert.equal((await send('/api/settings/credential','POST',cookieB,{key:keyB},ORIGIN)).status,200)
    assert.equal((await state(cookieB)).apiConfigured,true)
    assert.equal((await send('/api/settings/credential','DELETE',cookieA,undefined,ORIGIN)).status,200)
    assert.equal((await state(cookieA)).apiConfigured,false)
    assert.equal((await state(cookieB)).apiConfigured,true)
    assert.equal((await send('/api/settings/credential','DELETE',cookieB+'; '+cookieB,undefined,ORIGIN)).status,409)
    assert.equal((await state(cookieB)).apiConfigured,true)
    assert.equal((await send('/api/settings/credential/verify','POST',undefined,undefined,ORIGIN)).status,409)
    const noCookieChat=await send('/api/chat','POST',undefined,{messages:[{role:'user',content:'hello'}],preference:'api'},ORIGIN)
    assert.equal(noCookieChat.status,409)
    const missingKeyChat=await send('/api/chat','POST',cookieA,{messages:[{role:'user',content:'hello'}],preference:'api'},ORIGIN)
    assert.equal(missingKeyChat.status,409)
  } finally {
    if(probe.listening)await new Promise(resolve=>probe.close(resolve))
    if(server && server.exitCode===null){
      server.kill('SIGTERM')
      await new Promise(resolve=>{
        const timeout=setTimeout(()=>server.kill('SIGKILL'),1000)
        server.once('exit',()=>{clearTimeout(timeout);resolve()})
      })
    }
    await rm(home,{recursive:true,force:true})
  }
})
