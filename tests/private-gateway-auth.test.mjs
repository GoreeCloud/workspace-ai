import test from 'node:test'
import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {spawn} from 'node:child_process'
import {request as httpRequest} from 'node:http'
import {createServer} from 'node:net'
import {mkdtemp,writeFile,chmod,rm,symlink} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {GATEWAY_TOKEN_HEADER,loadPrivateGatewayToken,matchesPrivateGatewayToken} from '../server/private-gateway-auth.mjs'

const devEnv = {
  WORKSPACE_AI_PRIVATE_DEV_ENABLED:'true',
  WORKSPACE_AI_PRIVATE_DEV_BIND_ALL:'true',
  WORKSPACE_AI_PRIVATE_DEV_ISOLATED_CONTAINER:'true',
  WORKSPACE_AI_PRIVATE_DEV_GATEWAY_REQUIRED:'true'
}

test('private gateway token is opt-in, restricted, and strictly validated', async () => {
  const dir=await mkdtemp(path.join(os.tmpdir(),'workspace-ai-gateway-unit-'))
  try{
    const file=path.join(dir,'gateway.token')
    const secret=randomBytes(32).toString('hex')
    const env={...devEnv,WORKSPACE_AI_PRIVATE_DEV_GATEWAY_TOKEN_FILE:file}
    assert.equal(loadPrivateGatewayToken({}),null)
    assert.throws(()=>loadPrivateGatewayToken(devEnv),/requires explicit isolated/)
    assert.throws(()=>loadPrivateGatewayToken({...env,WORKSPACE_AI_PRIVATE_DEV_ENABLED:'false'}),/requires explicit isolated/)
    assert.throws(()=>loadPrivateGatewayToken({...env,WORKSPACE_AI_PRIVATE_DEV_GATEWAY_REQUIRED:'false'}),/requires explicit isolated/)
    assert.throws(()=>loadPrivateGatewayToken({...env,WORKSPACE_AI_PRIVATE_DEV_GATEWAY_TOKEN_FILE:'relative.token'}),/absolute path/)
    assert.throws(()=>loadPrivateGatewayToken(env),/ENOENT/)
    await writeFile(file,secret+'\n',{mode:0o600})
    const key=loadPrivateGatewayToken(env)
    assert.equal(key.length,32)
    assert.equal(matchesPrivateGatewayToken(key,secret),true)
    assert.equal(matchesPrivateGatewayToken(key,secret.toUpperCase()),true)
    assert.equal(matchesPrivateGatewayToken(key,randomBytes(32).toString('hex')),false)
    assert.equal(matchesPrivateGatewayToken(key,undefined),false)
    assert.equal(matchesPrivateGatewayToken(key,[secret,secret]),false)
    assert.equal(matchesPrivateGatewayToken(key,secret+', '+secret),false)
    await chmod(file,0o644)
    assert.throws(()=>loadPrivateGatewayToken(env),/restricted regular file/)
    await chmod(file,0o600)
    await writeFile(file,'synthetic-weak',{mode:0o600})
    assert.throws(()=>loadPrivateGatewayToken(env),/restricted regular file|exactly 32 random bytes/)
    await writeFile(file,secret,{mode:0o600})
    const link=path.join(dir,'linked.token')
    await symlink(file,link)
    assert.throws(()=>loadPrivateGatewayToken({...env,WORKSPACE_AI_PRIVATE_DEV_GATEWAY_TOKEN_FILE:link}),/ELOOP/)
  }finally{await rm(dir,{recursive:true,force:true})}
})

test('private gateway peer credential protects real server before Host and Origin checks', {timeout:20000}, async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'workspace-ai-gateway-http-'))
  const socket=createServer()
  let child
  try{
    const secret=randomBytes(32).toString('hex')
    const file=path.join(dir,'gateway.token')
    await writeFile(file,secret+'\n',{mode:0o600})
    await new Promise((ok,fail)=>socket.once('error',fail).listen(0,'127.0.0.1',ok))
    const port=socket.address().port
    await new Promise(ok=>socket.close(ok))
    const env={...process.env,...devEnv,
      HOME:dir,WORKSPACE_AI_PORT:String(port),
      WORKSPACE_AI_PRIVATE_DEV_ORIGIN:'https://workspace-ai-dev.goreecloud.com',
      WORKSPACE_AI_PRIVATE_DEV_GATEWAY_TOKEN_FILE:file,
      WORKSPACE_AI_ENABLE_SCHEDULED_AGENTS:'false'
    }
    for(const name of ['OPENAI_API_KEY','WORKSPACE_AI_AGENT_OWNER_KEY','WORKSPACE_SYNC_OAUTH_CLIENT_IDS'])delete env[name]
    child=spawn(process.execPath,[fileURLToPath(new URL('../server/index.mjs',import.meta.url))],{env,cwd:dir,stdio:'ignore'})
    const request=(host,token,origin,method='GET',route='/api/status')=>new Promise((ok,fail)=>{
      const headers={Host:host}
      if(token!==undefined)headers[GATEWAY_TOKEN_HEADER]=token
      if(origin!==undefined)headers.Origin=origin
      const req=httpRequest({host:'127.0.0.1',port,method,path:route,headers,timeout:3000},res=>{
        res.resume();res.on('end',()=>ok(res.statusCode))
      })
      req.on('error',fail);req.on('timeout',()=>req.destroy(Error('timeout')));req.end()
    })
    const host='workspace-ai-dev.goreecloud.com'
    let ready=false
    for(let retry=0;retry<90;retry++){
      if(child.exitCode!==null)throw Error('Server exited before protected startup')
      try{if(await request(host,secret)===200){ready=true;break}}catch{}
      await new Promise(ok=>setTimeout(ok,80))
    }
    assert.equal(ready,true)
    assert.equal(await request(host,undefined),403)
    assert.equal(await request(host,randomBytes(32).toString('hex')),403)
    assert.equal(await request('attacker.invalid',secret),403)
    assert.equal(await request(host,secret,'https://attacker.invalid','POST','/api/chat'),403)
    assert.equal(await request(host,undefined,'https://workspace-ai-dev.goreecloud.com','POST','/api/chat'),403)
    assert.equal(await request(host,secret),200)
  }finally{
    if(socket.listening)await new Promise(ok=>socket.close(ok))
    if(child&&child.exitCode===null){
      child.kill('SIGTERM')
      await new Promise(ok=>{const timeout=setTimeout(()=>child.kill('SIGKILL'),1000);child.once('exit',()=>{clearTimeout(timeout);ok()})})
    }
    await rm(dir,{recursive:true,force:true})
  }
})
