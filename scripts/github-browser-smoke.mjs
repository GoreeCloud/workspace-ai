// Synthetic Chromium acceptance for the native GoreeCloud GitHub browser.
// No provider credentials, paid inference, or external data are used.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
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
  const capture=async name=>{
    const directory=process.env.WORKSPACE_AI_SCREENSHOT_DIR
    if(!directory)return
    await mkdir(directory,{recursive:true})
    const image=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})
    assert.ok(typeof image.data==='string'&&image.data.length>100,'Browser screenshot was not captured')
    await writeFile(join(directory,name),Buffer.from(image.data,'base64'))
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
      if(url.pathname==='/api/smart-images/status')return wrap({configured:false,source:null,models:['ideogram-4-5','gpt-image-2-5','nano-banana-2-1']})
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
      if(url.pathname==='/api/documents/from-chat'){
        const body=JSON.parse(init.body)
        if(body.format!=='md')throw Error('Unexpected paid or binary synthetic file operation')
        const bytes=new TextEncoder().encode(body.source)
        const base64=btoa([...bytes].map(b=>String.fromCharCode(b)).join(''))
        window.__chatFileCalls=(window.__chatFileCalls||0)+1
        return crypto.subtle.digest('SHA-256',bytes).then(digest=>wrap({ok:true,name:'Systems.md',format:'md',mime:'text/markdown; charset=utf-8',bytes:bytes.length,base64,sha256:[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('')}))
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
  // Cross-feature integration: Documents and Engineering Studio render in the same app.
  await send('Emulation.setDeviceMetricsOverride',{width:1366,height:900,deviceScaleFactor:1,mobile:false})
  await evaluate("[...document.querySelectorAll('.workspaceNavLink')].find(n=>n.getAttribute('aria-label')==='Documents').click()")
  await wait("document.querySelector('.docStudio h1')?.textContent==='Documents'")
  assert.ok(await evaluate("document.querySelectorAll('.docStudio .docPanel').length>=2"))
  await capture('documents-desktop.png')
  await evaluate("[...document.querySelectorAll('.workspaceNavLink')].find(n=>n.getAttribute('aria-label')==='Engineering').click()")
  await wait("document.querySelector('.docStudio h1')?.textContent==='Engineering Studio'")
  assert.ok(await evaluate("document.querySelector('.engineeringForm')!==null"))
  await capture('engineering-desktop.png')
  assert.deepEqual(exceptions,[],'Documents and Engineering navigation has no exceptions')
  // Smart Image Generation synthetic browser acceptance: routing, model lock, billing guard.
  await evaluate("[...document.querySelectorAll('.workspaceNavLink')].find(n=>n.getAttribute('aria-label')==='Smart Images').click()")
  await wait("document.querySelector('.smartImagePage h1')?.textContent==='Smart Image Generation'")
  assert.equal(await evaluate("document.querySelectorAll('.smartImageOptions select').length"),4)
  assert.ok(await evaluate("[...document.querySelectorAll('.smartImageActions button')].some(b=>b.textContent.includes('Generate image')&&b.disabled)"),'Paid generation disabled without provider key')
  await evaluate("(()=>{const t=document.querySelector('.smartImagePage textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'A typographic logo');t.dispatchEvent(new Event('input',{bubbles:true}))})()")
  await wait("document.querySelector('.smartImageRoute')?.textContent.includes('Ideogram 4.5')")
  await evaluate("(()=>{const s=document.querySelector('.smartImageOptions select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'nano-banana-2-1');s.dispatchEvent(new Event('change',{bubbles:true}))})()")
  await wait("document.querySelector('.smartImageRoute')?.textContent.includes('Nano Banana 2.1')")
  assert.ok(await evaluate("document.querySelector('.smartImageRoute')?.textContent.includes('Manual model lock')"))
  assert.deepEqual(exceptions,[],'Smart Images browser workflow has no JavaScript exceptions')
  await send('Emulation.setDeviceMetricsOverride',{width:1366,height:900,deviceScaleFactor:1,mobile:false})
  await delay(150)
  await evaluate('window.scrollTo(0,0)')
  await capture('smart-images-desktop.png')

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
  assert.deepEqual(exceptions,[],'Saved prompt browser workflow has no JavaScript exceptions')
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true})
  assert.ok((await evaluate('document.documentElement.scrollWidth-window.innerWidth'))<10,'Horizontal mobile overflow')
  await evaluate("[...document.querySelectorAll('.workspaceNavLink')].find(n=>n.getAttribute('aria-label')==='Smart Images').click()")
  await wait("document.querySelector('.smartImagePage h1')?.textContent==='Smart Image Generation'")
  assert.ok((await evaluate('document.documentElement.scrollWidth-window.innerWidth'))<10,'Smart Images mobile horizontal overflow')
  await evaluate('window.scrollTo(0,0)')
  await delay(150)
  await capture('smart-images-mobile.png')
  await evaluate("document.querySelector('.viewport').scrollTop=document.querySelector('.viewport').scrollHeight")
  await delay(120)
  await capture('smart-images-mobile-actions.png')
  await evaluate("document.querySelector('.viewport').scrollTop=0")
  await evaluate("[...document.querySelectorAll('.workspaceNavLink')].find(n=>n.getAttribute('aria-label')==='Documents').click()")
  await wait("document.querySelector('.docStudio h1')?.textContent==='Documents'")
  assert.ok((await evaluate('document.documentElement.scrollWidth-window.innerWidth'))<10,'Documents mobile horizontal overflow')
  assert.ok(await evaluate("(()=>{const n=document.querySelector('.documentCapabilities');return n.scrollWidth>n.clientWidth&&n.getAttribute('tabindex')==='0'})()"),'Document capability cards remain keyboard-accessible and scrollable')
  await capture('documents-mobile.png')
  await evaluate("document.querySelector('.viewport').scrollTop=document.querySelector('.viewport').scrollHeight")
  await delay(120)
  await capture('documents-mobile-actions.png')
  await evaluate("document.querySelector('.viewport').scrollTop=0")
  await evaluate("[...document.querySelectorAll('.workspaceNavLink')].find(n=>n.getAttribute('aria-label')==='Engineering').click()")
  await wait("document.querySelector('.docStudio h1')?.textContent==='Engineering Studio'")
  assert.ok((await evaluate('document.documentElement.scrollWidth-window.innerWidth'))<10,'Engineering mobile horizontal overflow')
  assert.ok(await evaluate("(()=>{const n=document.querySelector('.documentCapabilities');return n.scrollWidth>n.clientWidth&&n.getAttribute('tabindex')==='0'})()"),'Engineering capability cards remain keyboard-accessible and scrollable')
  await capture('engineering-mobile.png')
  await evaluate("document.querySelector('.viewport').scrollTop=document.querySelector('.viewport').scrollHeight")
  await delay(120)
  await capture('engineering-mobile-actions.png')
  await evaluate("document.querySelector('.viewport').scrollTop=0")
  await evaluate("document.querySelector('.workspaceNavLink[aria-label=API]').click()")
  await wait("document.querySelector('.connected')!==null")
  assert.equal(await evaluate("document.querySelector('.connectionShort')?.textContent"),'Offline')
  assert.ok(await evaluate("(()=>{const n=document.querySelector('.connectionShort');return getComputedStyle(n).display!=='none'&&n.getBoundingClientRect().width>0})()"),'Mobile connection text is visible')
  assert.equal(await evaluate("document.querySelector('.connected')?.getAttribute('aria-label')"),'Not connected')
  // Synthetic document follow-up: create Markdown from saved Word source while AI is offline.
  await evaluate("localStorage.setItem('workspace-ai-history-v1', \"[{\\\"id\\\":\\\"fixture-doc\\\",\\\"title\\\":\\\"Generated document fixture\\\",\\\"updatedAt\\\":1750000000000,\\\"projectId\\\":null,\\\"messages\\\":[{\\\"id\\\":\\\"fixture-u\\\",\\\"role\\\":\\\"user\\\",\\\"content\\\":\\\"Create a Word document\\\"},{\\\"id\\\":\\\"fixture-a\\\",\\\"role\\\":\\\"assistant\\\",\\\"content\\\":\\\"# Systems\\\\n\\\\nOriginal content.\\\",\\\"document\\\":{\\\"title\\\":\\\"Systems\\\",\\\"name\\\":\\\"Systems.docx\\\",\\\"format\\\":\\\"docx\\\",\\\"bytes\\\":4200,\\\"source\\\":\\\"# Systems\\\\n\\\\nOriginal content.\\\"}}]}]\")")
  await send('Page.reload',{ignoreCache:true})
  await wait("document.querySelector('.workspaceNavChildren button[title=\"Generated document fixture\"]')!==null")
  await evaluate("document.querySelector('.workspaceNavChildren button[title=\"Generated document fixture\"]').click()")
  await wait("document.querySelector('.chatDocumentCard strong')?.textContent==='Systems.docx'")
  await evaluate("(()=>{const t=document.querySelector('textarea[aria-label=\"Message to Workspace AI\"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'Create a Markdown version of that document');t.dispatchEvent(new Event('input',{bubbles:true}))})()")
  await wait("document.querySelector('button[aria-label=\"Send message\"]')?.disabled===false")
  await evaluate("document.querySelector('button[aria-label=\"Send message\"]').click()")
  await wait("[...document.querySelectorAll('.chatDocumentCard strong')].some(n=>n.textContent==='Systems.md')")
  assert.equal(await evaluate("window.__chatFileCalls"),1)
  await capture('chat-document-conversion-mobile.png')
  await send('Emulation.setDeviceMetricsOverride',{width:1366,height:900,deviceScaleFactor:1,mobile:false})
  await capture('chat-document-conversion-desktop.png')
  assert.deepEqual(exceptions,[],'Chat document conversion browser workflow has no exceptions')
  assert.deepEqual(exceptions,[],'Browser JavaScript exceptions')
  console.log(JSON.stringify({passed:true,repositoryBrowser:true,issues:true,pullRequests:true,pagination:true,dropbox:true,mobile:true}))
} finally {
  try{ws?.close()}catch{}
  chrome.kill('SIGTERM')
  await rm(profile,{recursive:true,force:true,maxRetries:4,retryDelay:200}).catch(()=>{})
}
