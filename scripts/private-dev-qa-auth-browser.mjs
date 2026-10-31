// CI-only headless Chromium acceptance through disposable private HTTPS Caddy.
// Never use owner credentials, a live Caddy route, persistent browser profiles,
// or any published backend port. TLS CA verification is handled independently by
// private-dev-qa-gateway-check.sh; only this ephemeral synthetic Chrome profile
// allows the local Caddy self-signed certificate.
import assert from 'node:assert/strict'
import {execFileSync,spawn} from 'node:child_process'
import {readFile,mkdtemp,rm,chmod} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {setTimeout as delay} from 'node:timers/promises'

assert.equal(process.env.GITHUB_ACTIONS,'true','This test is restricted to disposable GitHub CI.')
const gateway=process.env.WORKSPACE_AI_QA_GATEWAY_CONTAINER||''
assert.match(gateway,/^goreecloud-workspace-ai-qa-rehearsal-[0-9]+$/)
const qaDir=process.env.WORKSPACE_AI_QA_DIR||''
assert.match(qaDir,/goreecloud-workspace-ai-qa-rehearsal\.[A-Za-z0-9]{8}$/)
const chromePath=process.env.CHROMIUM_EXECUTABLE
assert.ok(chromePath,'Chromium is required for private HTTPS browser acceptance.')
const password=(await readFile(join(qaDir,'test-password'),'utf8')).trim()
assert.ok(password.length>=20,'Synthetic test credentials missing.')
const ip=execFileSync('docker',['inspect',gateway,'--format',
  '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'],
  {encoding:'utf8',timeout:10000}).trim()
assert.match(ip,/^172\.(1[6-9]|2[0-9]|3[01])\.\d{1,3}\.\d{1,3}$/)
const profile=await mkdtemp(join(tmpdir(),'goreecloud-qa-chrome-'))
await chmod(profile,0o700)
const chrome=spawn(chromePath,[
 '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
 '--no-first-run','--no-default-browser-check','--no-proxy-server',
 '--ignore-certificate-errors', // disposable synthetic CA ONLY; curl independently verifies TLS.
 '--host-resolver-rules=MAP workspace-ai-dev.goreecloud.com '+ip,
 '--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',
 '--user-data-dir='+profile,'about:blank'
],{stdio:['ignore','ignore','pipe']})
let chromeStartupLog=''
let chromeSpawnError=null
chrome.stderr.on('data',chunk=>{chromeStartupLog=(chromeStartupLog+String(chunk)).slice(-4096)})
chrome.once('error',error=>{chromeSpawnError=error?.code||'spawn-error'})
let ws
const pending=new Map()
let nextId=0,authChallenges=0,stopped=false
const send=(method,params={})=>new Promise((resolve,reject)=>{
 const id=++nextId
 pending.set(id,[resolve,reject])
 ws.send(JSON.stringify({id,method,params}))
})
try {
 let tab, port
 const deadline=Date.now()+45_000
 while(Date.now()<deadline){
  if(chrome.exitCode!==null||chrome.signalCode!==null){
   throw Error('Synthetic Chromium terminated before debugging was ready.')
  }
  // --remote-debugging-port=0 asks Chrome to bind an available loopback port
  // and publish it in its ephemeral profile. Avoid a close-then-bind port race.
  if(!port){
   try{
    const active=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split(/\\r?\\n/)
    const candidate=Number(active[0])
    if(Number.isInteger(candidate)&&candidate>=1024&&candidate<=65535)port=candidate
   }catch{}
  }
  if(port){
   try{
    const r=await fetch('http://127.0.0.1:'+port+'/json/list',{
     signal:AbortSignal.timeout(1500)
    })
    if(r.ok){tab=(await r.json()).find(x=>x.type==='page'&&x.webSocketDebuggerUrl);if(tab)break}
   }catch{}
  }
  await delay(150)
 }
 if(!tab?.webSocketDebuggerUrl){
  // This is a disposable synthetic Chromium instance, before authentication.
  // Print only bounded, scrubbed startup diagnostics; never log credentials.
  const stderr=chromeStartupLog.split(/\r?\n/).filter(Boolean).slice(-6)
   .map(line=>line.replace(/\/[A-Za-z0-9_.\/-]+/g,'[path]').slice(0,160))
  console.error('Synthetic Chrome startup diagnostics:',{
   exitCode:chrome.exitCode,signalCode:chrome.signalCode,
   spawnError:chromeSpawnError,debugPortFileFound:Boolean(port),stderr
  })
  throw Error('Synthetic browser debugging target unavailable after bounded Chromium startup.')
 }
 ws=new WebSocket(tab.webSocketDebuggerUrl)
 await new Promise((resolve,reject)=>{
  ws.addEventListener('open',resolve,{once:true})
  ws.addEventListener('error',reject,{once:true})
 })
 ws.addEventListener('message',e=>{
  const packet=JSON.parse(e.data)
  if(packet.method==='Fetch.requestPaused'){
   void send('Fetch.continueRequest',{requestId:packet.params.requestId}).catch(()=>{})
  }else if(packet.method==='Fetch.authRequired'){
   const authorized=packet.params.request?.url?.startsWith('https://workspace-ai-dev.goreecloud.com/') &&
    packet.params.authChallenge?.origin==='https://workspace-ai-dev.goreecloud.com'
   if(authorized)authChallenges++
   void send('Fetch.continueWithAuth',{requestId:packet.params.requestId,
    authChallengeResponse:authorized
      ? {response:'ProvideCredentials',username:'synthetic-qa',password}
      : {response:'CancelAuth'}}).catch(()=>{})
  }
  if(!pending.has(packet.id))return
  const [resolve,reject]=pending.get(packet.id);pending.delete(packet.id)
  packet.error?reject(Error(packet.error.message)):resolve(packet.result)
 })
 const evaluate=async (expression,awaitPromise=false)=>{
  const result=await send('Runtime.evaluate',{expression,awaitPromise,returnByValue:true})
  if(result.exceptionDetails)throw Error('QA browser JavaScript exception.')
  return result.result.value
 }
 const wait=async expression=>{
  for(let n=0;n<100;n++){
   try{if(await evaluate(expression))return}catch{}
   await delay(150)
  }
  throw Error('Authenticated browser UI did not reach expected state.')
 }
 await send('Page.enable')
 await send('Runtime.enable')
 await send('Fetch.enable',{handleAuthRequests:true})
 await send('Page.navigate',{url:'https://workspace-ai-dev.goreecloud.com/'})
 await wait("document.querySelectorAll('.workspaceNavLink').length===9")
 assert.ok(authChallenges>0,'Browser did not exercise the Basic Auth challenge.')
 assert.equal(await evaluate("location.protocol==='https:'&&location.hostname==='workspace-ai-dev.goreecloud.com'"),true)
 assert.equal(await evaluate("document.querySelector('#root')!==null"),true)
 assert.equal(await evaluate("fetch('/api/status').then(r=>r.status)",true),200)
 await evaluate("document.querySelector('.workspaceNavLink[aria-label=Projects]').click()")
 await wait("document.querySelector('.workspacePage h1')?.textContent==='Projects'")
 await evaluate("document.querySelector('.projectDirectoryToolbar button[aria-expanded]').click()")
 await wait("document.querySelector('#new-project-name')!==null")
 await evaluate("document.querySelector('#new-project-name').focus()")
 await send('Input.insertText',{text:'Private HTTPS Synthetic Browser Project'})
 await evaluate("document.querySelector('.projectCreateForm button[type=submit]').click()")
 await wait("document.querySelector('.projectStudioHeader h2')?.textContent==='Private HTTPS Synthetic Browser Project'")
 const saved="JSON.parse(localStorage.getItem('workspace-ai-workspace-v1')||'{}').projects?.some(p=>p.name==='Private HTTPS Synthetic Browser Project')===true"
 assert.equal(await evaluate(saved),true,'Synthetic project was not persisted.')
 await send('Page.reload',{ignoreCache:true})
 await wait("document.querySelectorAll('.workspaceNavLink').length===9")
 assert.equal(await evaluate(saved),true,'Synthetic project lost across authenticated reload.')
 console.log('PASS: disposable Chromium completed authenticated TLS gateway and real web-app navigation.')
 console.log('PASS: synthetic project persisted across browser reload; no owner data or credentials used.')
 console.log('PASS: Basic Auth challenge answered only inside isolated synthetic browser profile.')
}finally{
 stopped=true
 try{ws?.close()}catch{}
 for(const [,pair] of pending)pair[1](Error('Browser test completed'))
 chrome.kill('SIGTERM')
 await Promise.race([new Promise(resolve=>chrome.once('exit',resolve)),delay(3000)])
 if(chrome.exitCode===null)chrome.kill('SIGKILL')
 // Chromium child processes may briefly recreate profile files after the main
 // process exits. Node's bounded ENOTEMPTY/EBUSY retries make cleanup reliable.
 await rm(profile,{recursive:true,force:true,maxRetries:25,retryDelay:200})
}
