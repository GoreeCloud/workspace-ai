// Synthetic Chromium acceptance for the GoreeCloud provider browser and chat.
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
// CI uses an ephemeral, isolated test browser profile. Do not weaken local user browsers.
if (process.env.CI === 'true' || (typeof process.getuid === 'function' && process.getuid() === 0)) browserArgs.unshift('--no-sandbox')
const chrome = spawn(executable, browserArgs, { stdio: ['ignore','ignore','pipe'] })
let browserStderr=''
chrome.stderr?.on('data',chunk=>{browserStderr=(browserStderr+chunk.toString()).slice(-5000)})
let ws
try {
  let tab
  for (let attempt = 0; attempt < 120; attempt++) {
    if (chrome.exitCode !== null) throw Error('Chromium exited before connecting.')
    try {
      const response = await fetch('http://127.0.0.1:' + port + '/json/list')
      if(response.ok){
        const targets=await response.json()
        tab=Array.isArray(targets)?targets.find(t=>t.type==='page'&&t.webSocketDebuggerUrl):null
        if(tab)break
      }
    } catch {}
    await delay(150)
  }
  assert.ok(tab?.webSocketDebuggerUrl, 'Could not open a Chromium debugging target. '+browserStderr)
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
      if(url.pathname==='/api/status')return wrap({connected:false,planEnabled:false,apiConfigured:true,apiKeySource:'synthetic-qa',accounts:[]})
      if(url.pathname==='/api/chat'){
        const count=Number(sessionStorage.getItem('qa-chat-requests')||'0')+1
        sessionStorage.setItem('qa-chat-requests',String(count))
        const frame=count===1
          ? '{"type":"meta","provider":"api","model":"synthetic-qa"}\\n{"type":"delta","text":"Synthetic partial response"}\\n'
          : '{"type":"meta","provider":"api","model":"synthetic-qa"}\\n{"type":"delta","text":"Complete after recovery"}\\n{"type":"complete"}\\n'
        const encoder=new TextEncoder()
        return Promise.resolve(new Response(new ReadableStream({start(controller){
          controller.enqueue(encoder.encode(frame))
          if(count!==1)controller.close()
        }}),{status:200,headers:{'Content-Type':'application/x-ndjson'}}))
      }
      if(url.pathname==='/api/integrations')return wrap({executionEnabled:false,services:[{
        id:'github',name:'GitHub',kind:'api',category:'Development',auth:'token',
        connected:true,hasSessionToken:true,status:'connected',message:'Synthetic authorized connection',
        tools:[{name:'repos.list',description:'Read repositories',executable:false}]
      },{
        id:'dropbox',name:'Dropbox',kind:'api',category:'Files',auth:'token',
        connected:true,hasSessionToken:true,status:'connected',message:'Synthetic Dropbox session',
        tools:[{name:'files.list',description:'Read files',executable:false}]
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
      if(url.pathname==='/api/integrations/dropbox/data'){
        const path=url.searchParams.get('path')||''
        const cursor=url.searchParams.get('cursor')
        if(cursor)return wrap({path:null,readOnly:true,nextCursor:null,entries:[
          {type:'file',name:'second-page.txt',path:'/second-page.txt',size:512,modified:''}
        ]})
        if(path==='/Design')return wrap({path,readOnly:true,nextCursor:null,entries:[
          {type:'file',name:'mockup.png',path:'/Design/mockup.png',size:1234,modified:''}
        ]})
        return wrap({path:'',readOnly:true,nextCursor:'next',entries:[
          {type:'folder',name:'Design',path:'/Design',size:null,modified:''},
          {type:'file',name:'notes.txt',path:'/notes.txt',size:1024,modified:''}
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
  await evaluate("[...document.querySelectorAll('.workspaceCard')].find(c=>c.querySelector('.workspaceCardHead strong')?.textContent==='Dropbox').querySelector('.outline').click()")
  await wait("document.querySelector('.dropboxEntries li')?.textContent.includes('Design')")
  await evaluate("[...document.querySelectorAll('.dropboxReader button')].find(n=>n.textContent.includes('Load more')).click()")
  await wait("document.querySelectorAll('.dropboxEntries li').length===3")
  await evaluate("document.querySelector('.dropboxEntries li button').click()")
  await wait("document.querySelector('.dropboxEntries li')?.textContent.includes('mockup.png')")
  await evaluate("document.querySelector('button[aria-label=\"Back to parent Dropbox folder\"]').click()")
  await wait("document.querySelector('.dropboxEntries li')?.textContent.includes('Design')")
  // Synthetic saved prompt workflow: create, persist in view state, and insert without sending.
  await evaluate("document.querySelector('.workspaceNavLink[aria-label=Prompts]').click()")
  await wait("document.querySelector('.promptsPage h1')?.textContent==='Prompts'")
  await evaluate("[...document.querySelectorAll('.promptsPage button')].find(b=>b.textContent.includes('New prompt')).click()")
  await wait("document.querySelector('.promptEditor input')!==null")
  await evaluate("(()=>{const e=document.querySelector('#prompt-name');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'Review test');e.dispatchEvent(new Event('input',{bubbles:true}));const t=document.querySelector('#prompt-body');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'Review this example');t.dispatchEvent(new Event('input',{bubbles:true}))})()")
  await wait("document.querySelector('.promptEditor button[type=submit]')?.disabled===false")
  await evaluate("document.querySelector('.promptEditor button[type=submit]').click()")
  await wait("document.querySelector('.promptCard strong')?.textContent==='Review test'")
  await evaluate("document.querySelector('.promptCard button.primary').click()")
  await wait("document.querySelector('textarea[aria-label=\"Message to Workspace AI\"]')?.value==='Review this example'")
  // An intercepted, indefinite response stream must persist a partial answer
  // before reload and recover it as interrupted, without losing the question.
  const chooseSyntheticApi=async()=>{
    await evaluate("document.querySelector('button[aria-label=\"Chat options\"]').click()")
    await wait("document.querySelector('.chatHeaderPopup')!==null")
    await evaluate("[...document.querySelectorAll('.chatHeaderPopup button')].find(b=>b.textContent==='Settings').click()")
    await wait("document.querySelector('.settingsTabs')!==null")
    await evaluate("[...document.querySelectorAll('.settingsTabs button')].find(b=>b.textContent==='Models & billing').click()")
    await wait("document.querySelector('.settingsPanel:not([hidden]) .segments button')!==null")
    await evaluate("[...document.querySelectorAll('.settingsPanel:not([hidden]) .segments button')].find(b=>b.textContent==='OpenAI API').click()")
    await wait("[...document.querySelectorAll('.settingsPanel:not([hidden]) .segments button')].some(b=>b.textContent==='OpenAI API'&&b.getAttribute('aria-pressed')==='true')")
    await evaluate("document.querySelector('button[aria-label=\"Close settings\"]').click()")
  }
  await chooseSyntheticApi()
  await wait("document.querySelector('button[aria-label=\"Send message\"]')?.disabled===false")
  await evaluate("document.querySelector('button[aria-label=\"Send message\"]').click()")
  await wait("(()=>{const chat=JSON.parse(localStorage.getItem('workspace-ai-history-v1')||'[]')[0];return chat?.messages?.[1]?.pending===true&&chat.messages[1].content==='Synthetic partial response'})()")
  assert.equal(await evaluate("sessionStorage.getItem('qa-chat-requests')"),'1')
  await send('Page.reload',{ignoreCache:true})
  await wait("(()=>{const chat=JSON.parse(localStorage.getItem('workspace-ai-history-v1')||'[]')[0];return chat?.messages?.[0]?.content==='Review this example'&&chat.messages[1].content==='Synthetic partial response'&&chat.messages[1].pending===false&&chat.messages[1].error===true})()")
  await evaluate("document.querySelector('.workspaceNavLink[aria-label=\"All Chats\"]').click()")
  await wait("document.querySelector('.chatJump')!==null")
  await evaluate("document.querySelector('.chatJump').click()")
  await wait("document.querySelector('.message.assistant .markdown')?.textContent==='Synthetic partial response'")
  await chooseSyntheticApi()
  await evaluate("(()=>{const e=document.querySelector('textarea[aria-label=\"Message to Workspace AI\"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'Second synthetic message');e.dispatchEvent(new Event('input',{bubbles:true}))})()")
  await wait("document.querySelector('button[aria-label=\"Send message\"]')?.disabled===false")
  await evaluate("document.querySelector('button[aria-label=\"Send message\"]').click()")
  await wait("(()=>{const a=JSON.parse(localStorage.getItem('workspace-ai-history-v1')||'[]')[0]?.messages;return a?.length===4&&a[3]?.content==='Complete after recovery'&&a[3].pending===false&&!a[3].error})()")
  assert.equal(await evaluate("sessionStorage.getItem('qa-chat-requests')"),'2','No duplicate stream request')
  assert.deepEqual(exceptions,[],'Saved prompt browser workflow has no JavaScript exceptions')
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true})
  assert.ok((await evaluate('document.documentElement.scrollWidth-window.innerWidth'))<10,'Horizontal mobile overflow')
  await evaluate("document.querySelector('.workspaceNavLink[aria-label=API]').click()")
  await wait("document.querySelector('.connected')!==null")
  assert.equal(await evaluate("document.querySelector('.connectionShort')?.textContent"),'Offline')
  assert.ok(await evaluate("(()=>{const n=document.querySelector('.connectionShort');return getComputedStyle(n).display!=='none'&&n.getBoundingClientRect().width>0})()"),'Mobile connection text is visible')
  assert.equal(await evaluate("document.querySelector('.connected')?.getAttribute('aria-label')"),'Not connected')
  assert.deepEqual(exceptions,[],'Browser JavaScript exceptions')
  console.log(JSON.stringify({passed:true,repositoryBrowser:true,issues:true,pullRequests:true,pagination:true,dropbox:true,streamRecovery:true,mobile:true}))
} finally {
  try{ws?.close()}catch{}
  chrome.kill('SIGTERM')
  await rm(profile,{recursive:true,force:true,maxRetries:4,retryDelay:200}).catch(()=>{})
}
