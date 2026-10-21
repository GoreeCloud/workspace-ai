import test from 'node:test'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {mkdtemp,rm} from 'node:fs/promises'
import {createServer} from 'node:net'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

// Start the real Express entrypoint in an empty HOME and CWD. In particular,
// dotenv must not load an operator's personal .env or OAuth credentials.
test('fresh loopback server denies untrusted origins with agents disabled', {timeout:15000}, async () => {
 const home=await mkdtemp(path.join(os.tmpdir(),'workspace-ai-loopback-'))
 const address=createServer()
 let child
 try {
  await new Promise((resolve,reject)=>address.once('error',reject).listen(0,'127.0.0.1',resolve))
  const port=address.address().port
  await new Promise(resolve=>address.close(resolve))
  const env={...process.env,HOME:home,WORKSPACE_AI_PORT:String(port),WORKSPACE_AI_ENABLE_SCHEDULED_AGENTS:'false'}
  for(const name of ['OPENAI_API_KEY','WORKSPACE_AI_AGENT_OWNER_KEY','WORKSPACE_SYNC_OAUTH_CLIENT_IDS'])
   delete env[name]
  child=spawn(process.execPath,[fileURLToPath(new URL('../server/index.mjs',import.meta.url))],{
   env,cwd:home,stdio:'ignore',
  })
  const base='http://127.0.0.1:'+port
  let response
  for(let tries=0;tries<80;tries++){
   if(child.exitCode!==null)throw Error('Isolated server exited before readiness')
   try{response=await fetch(base+'/api/agents/status');if(response.ok)break}
   catch{/* Loopback server is not ready yet. */}
   await new Promise(resolve=>setTimeout(resolve,75))
  }
  assert.equal(response?.status,200,'Isolated server did not become ready')
  const agents=await response.json()
  assert.equal(agents.enabled,false)
  assert.equal(agents.apiReady,false)
  const status=await fetch(base+'/api/status')
  assert.equal(status.status,200)
  assert.match(status.headers.get('content-security-policy')||'',/frame-ancestors 'none'/)
  assert.equal(status.headers.get('cache-control'),'no-store')
  const identity=await status.json()
  assert.equal(identity.connected,false)
  assert.equal(identity.apiConfigured,false)
  const blocked=await fetch(base+'/api/chat',{
   method:'POST',headers:{Origin:'https://cross-origin.invalid','Content-Type':'application/json'},
   body:'{}',
  })
  assert.equal(blocked.status,403)
  assert.equal((await fetch(base+'/api/nonexistent')).status,404)
 }finally{
  if(address.listening)await new Promise(resolve=>address.close(resolve))
  if(child){
   if(child.exitCode===null&&child.signalCode===null){
    child.kill('SIGTERM')
    await new Promise(resolve=>{
     const timeout=setTimeout(()=>child.kill('SIGKILL'),1000)
     timeout.unref()
     child.once('exit',()=>{clearTimeout(timeout);resolve()})
    })
   }
  }
  await rm(home,{recursive:true,force:true})
 }
})
