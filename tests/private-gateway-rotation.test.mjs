import test from 'node:test'
import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {spawn} from 'node:child_process'
import {request as httpRequest} from 'node:http'
import {createServer} from 'node:net'
import {mkdtemp,writeFile,unlink,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const entrypoint=fileURLToPath(new URL('../server/index.mjs',import.meta.url))
const hostname='workspace-ai-dev.goreecloud.com'

async function reservePort() {
  const socket=createServer()
  await new Promise((resolve,reject)=>socket.once('error',reject).listen(0,'127.0.0.1',resolve))
  const port=socket.address().port
  await new Promise(resolve=>socket.close(resolve))
  return port
}

async function status(port,token) {
  return new Promise((resolve,reject)=>{
    const req=httpRequest({hostname:'127.0.0.1',port,path:'/api/status',timeout:2500,
      headers:{Host:hostname,'X-GoreeCloud-Gateway-Version':'1','X-GoreeCloud-Gateway-Token':token}},res=>{
      res.resume()
      res.on('end',()=>resolve(res.statusCode))
    })
    req.on('error',reject)
    req.on('timeout',()=>req.destroy(new Error('request timed out')))
    req.end()
  })
}

function waitForExit(child, timeoutMs=5000) {
  if(child.exitCode!==null || child.signalCode!==null)return Promise.resolve(child.exitCode)
  return new Promise((resolve,reject)=>{
    const onExit=code=>{clearTimeout(timer);resolve(code)}
    const timer=setTimeout(()=>{
      child.removeListener('exit',onExit)
      reject(new Error('Protected backend did not exit on time'))
    },timeoutMs)
    child.once('exit',onExit)
  })
}

async function stop(child) {
  if(!child || child.exitCode!==null || child.signalCode!==null)return
  child.kill('SIGTERM')
  try{await waitForExit(child,1500)}catch{
    child.kill('SIGKILL')
    await waitForExit(child,1500)
  }
}

test('protected gateway rotation revokes the previous token only after backend restart', {timeout:30000}, async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'workspace-ai-gateway-rotation-'))
  const file=path.join(dir,'gateway.token')
  const port=await reservePort()
  const original=randomBytes(32).toString('hex')
  const rotated=randomBytes(32).toString('hex')
  const env={...process.env,
    HOME:dir,WORKSPACE_AI_PORT:String(port),
    WORKSPACE_AI_PRIVATE_DEV_ENABLED:'true',
    WORKSPACE_AI_PRIVATE_DEV_ORIGIN:`https://${hostname}`,
    WORKSPACE_AI_PRIVATE_DEV_BIND_ALL:'true',
    WORKSPACE_AI_PRIVATE_DEV_ISOLATED_CONTAINER:'true',
    WORKSPACE_AI_PRIVATE_DEV_GATEWAY_REQUIRED:'true',
    WORKSPACE_AI_PRIVATE_DEV_GATEWAY_TOKEN_FILE:file,
    WORKSPACE_AI_ENABLE_SCHEDULED_AGENTS:'false'
  }
  for(const name of ['OPENAI_API_KEY','WORKSPACE_AI_AGENT_OWNER_KEY','WORKSPACE_SYNC_OAUTH_CLIENT_IDS'])delete env[name]
  let child
  const start=()=>spawn(process.execPath,[entrypoint],{env,cwd:dir,stdio:'ignore'})
  const ready=async token=>{
    for(let attempt=0;attempt<90;attempt++){
      if(child.exitCode!==null || child.signalCode!==null)throw Error('Protected backend exited during startup')
      try{if(await status(port,token)===200)return}catch{}
      await new Promise(resolve=>setTimeout(resolve,80))
    }
    throw Error('Protected backend did not become healthy')
  }
  try{
    await writeFile(file,original+'\n',{mode:0o600})
    child=start()
    await ready(original)
    assert.equal(await status(port,rotated),403)

    // The running service intentionally holds its startup token. Replacing the
    // file alone is not revocation; operators must stop/restart the backend.
    await writeFile(file,rotated+'\n',{mode:0o600})
    assert.equal(await status(port,original),200)
    assert.equal(await status(port,rotated),403)
    await stop(child)

    child=start()
    await ready(rotated)
    assert.equal(await status(port,original),403)
    assert.equal(await status(port,rotated),200)
    await stop(child)

    // Credential withdrawal must fail closed on restart, not silently open
    // the unauthenticated localhost configuration in protected mode.
    await unlink(file)
    child=start()
    const exitCode=await waitForExit(child)
    assert.notEqual(exitCode,0)
    await assert.rejects(status(port,rotated),/ECONNREFUSED|ECONNRESET/)

    await writeFile(file,rotated+'\n',{mode:0o600})
    child=start()
    await ready(rotated)
    assert.equal(await status(port,original),403)
    assert.equal(await status(port,rotated),200)
  }finally{
    await stop(child)
    await rm(dir,{recursive:true,force:true})
  }
})
