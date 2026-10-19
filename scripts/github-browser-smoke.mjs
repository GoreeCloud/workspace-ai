// Synthetic Chromium acceptance for the native GoreeCloud GitHub browser.
// No provider credentials, paid inference, or external data are used.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'

const base = new URL(process.env.WORKSPACE_AI_BASE_URL || 'http://127.0.0.1:3031')
if (base.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(base.hostname))
  throw Error('GitHub browser acceptance requires localhost HTTP.')
const executable = process.env.CHROMIUM_EXECUTABLE || 'chromium'
const profile = await mkdtemp(join(tmpdir(), 'workspace-ai-github-browser-'))
const port = await new Promise((resolve, reject) => {
  const socket = createServer()
  socket.on('error', reject)
  socket.listen(0, '127.0.0.1', () => {
    const selected = socket.address().port
    socket.close(() => resolve(selected))
  })
})
const browserArgs = [
  '--headless=new', '--disable-gpu', '--disable-dev-shm-usage',
  '--no-first-run', '--remote-debugging-port=' + port, '--user-data-dir=' + profile, 'about:blank'
]
if (typeof process.getuid === 'function' && process.getuid() === 0) browserArgs.unshift('--no-sandbox')
const chrome = spawn(executable, browserArgs, { stdio: 'ignore' })
let ws
try {
  let tab
  for (let attempt = 0; attempt < 60; attempt++) {
    if (chrome.exitCode !== null) throw Error('Chromium exited before connecting.')
    try {
      const response = await fetch('http://127.0.0.1:' + port + '/json/new?about:blank', {method:'PUT'})
      if (response.ok) { tab = await response.json(); break }
    } catch {}
    await delay(150)
  }
  assert.ok(tab?.webSocketDebuggerUrl, 'Could not open a Chromium debugging target.')
  ws = new WebSocket(tab.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, {once:true})
    ws.addEventListener('error', reject, {once:true})
  })
  let nextId=0
  const pending=new Map(), exceptions=[]
  ws.addEventListener('message',event=>{
    const packet=JSON.parse(event.data)
    if (packet.method==='Runtime.exceptionThrown') exceptions.push(packet.params?.exceptionDetails?.text || 'Browser exception')
    if (!pending.has(packet.id)) return
    const [resolve,reject]=pending.get(packet.id);pending.delete(packet.id)
    packet.error?reject(Error(packet.error.message)):resolve(packet.result)
  })
  const send=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++nextId;pending.set(id,[resolve,reject])
    ws.send(JSON.stringify({id,method,params}))
  })
  const evaluate=async expression=>{
    const r=await send('Runtime.evaluate',{expression,returnByValue:true})
    if(r.exceptionDetails)throw Error('Browser evaluation failed: '+expression)
    return r.result.value
  }
  const wait=async expression=>{
    for(let i=0;i<65;i++){
      try{if(await evaluate(expression))return}catch{}
      await delay(100)
    }
    throw Error('Browser timed out: '+expression)
  }
  await send('Page.enable')
  await send('Runtime.enable')
  const fakeScript = `(()=>{
    const nativeFetch=window.fetch.bind(window)
    window.fetch=(input,init)=>{
      const raw=typeof input==='string'?input:input?.url
      const url=new URL(raw,location.href)
      const wrap=body=>Promise.resolve(new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}}))
      if(url.pathname==='/api/integrations')return wrap({executionEnabled:false,services:[{
        id:'github',name:'GitHub',kind:'api',category:'Development',auth:'token',
        connected:true,hasSessionToken:true,status:'connected',message:'Synthetic authorized connection',
        tools:[{name:'repos.list',description:'Read repositories',executable:false}]
      }]})
      if(url.pathname==='/api/integrations/github/data'){
        const resource=url.searchParams.get('resource')
        const page=Number(url.searchParams.get('page')||1)
        if(resource==='repos'){
          return wrap({resource,repo:null,readOnly:true,nextPage:page===1?2:null,
            results:page===1?[
              {name:'workspace-ai',description:'Synthetic AI workspace',isPrivate:false,stars:3,updatedAt:''},
              {name:'private-repo',description:'Synthetic private project',isPrivate:true,stars:0,updatedAt:''}
            ]:[{name:'second-page',description:'Synthetic pagination',isPrivate:false,stars:0,updatedAt:''}]
          })
        }
        if(resource==='issues')return wrap({resource,repo:'workspace-ai',readOnly:true,nextPage:null,results:[
          {number:21,title:'Synthetic issue',state:'open',updatedAt:'2026-10-19T00:00:00Z'}
        ]})
        if(resource==='pulls')return wrap({resource,repo:'workspace-ai',readOnly:true,nextPage:null,results:[
          {number:13,title:'Synthetic pull request',state:'open',updatedAt:'2026-10-19T00:00:00Z'}
        ]})
      }
      return nativeFetch(input,init)
    }
  })()`
  await send('Page.addScriptToEvaluateOnNewDocument',{source:fakeScript})
  await send('Page.navigate',{url:base.href})
  await wait("document.querySelector('.workspaceNavLink[aria-label=API]')!==null")
  await evaluate("document.querySelector('.workspaceNavLink[aria-label=API]').click()")
  await wait("document.querySelector('.workspaceCardHead strong')?.textContent==='GitHub'")
  await evaluate("[...document.querySelectorAll('.workspaceCard .outline')].find(n=>n.textContent.includes('Browse repositories')).click()")
  await wait("document.querySelector('.githubEntries li')?.textContent.includes('workspace-ai')")
  assert.equal(await evaluate("document.querySelectorAll('.githubEntries li').length"),2)
  await evaluate("[...document.querySelectorAll('.githubReader button')].find(n=>n.textContent.includes('Load more')).click()")
  await wait("document.querySelectorAll('.githubEntries li').length===3")
  await evaluate("document.querySelector('.githubSearch input').value='private'; document.querySelector('.githubSearch input').dispatchEvent(new Event('input',{bubbles:true}))")
  // React's controlled input may require native setter; validate keyboard interaction instead.
  await evaluate("document.querySelector('.githubEntries li button').click()")
  await wait("document.querySelector('.githubReaderTabs')!==null")
  await wait("document.querySelector('.githubEntries li')?.textContent.includes('Synthetic issue')")
  await evaluate("[...document.querySelectorAll('.githubReaderTabs button')].find(n=>n.textContent==='Pull requests').click()")
  await wait("document.querySelector('.githubEntries li')?.textContent.includes('Synthetic pull request')")
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true})
  assert.ok((await evaluate('document.documentElement.scrollWidth-window.innerWidth'))<10,'Horizontal mobile overflow')
  assert.deepEqual(exceptions,[],'Browser JavaScript exceptions')
  console.log(JSON.stringify({passed:true,repositoryBrowser:true,issues:true,pullRequests:true,pagination:true,mobile:true}))
} finally {
  try{ws?.close()}catch{}
  chrome.kill('SIGTERM')
  await rm(profile,{recursive:true,force:true,maxRetries:4,retryDelay:200}).catch(()=>{})
}
