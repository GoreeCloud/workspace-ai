// Optional interactive QA for a running, loopback-bound Workspace AI server.
// Usage: CHROMIUM_EXECUTABLE=/path/to/chrome WORKSPACE_AI_BASE_URL=http://127.0.0.1:3031 npm run browser:smoke
import assert from 'node:assert/strict'
import {SERVICES} from '../server/services.mjs'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'

const base = new URL(process.env.WORKSPACE_AI_BASE_URL || 'http://127.0.0.1:3031')
if (base.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(base.hostname)) {
  throw Error('Browser QA supports loopback HTTP only.')
}
const executable = process.env.CHROMIUM_EXECUTABLE || 'chromium'
const profile = await mkdtemp(join(tmpdir(), 'workspace-ai-chromium-'))
const port = await new Promise((resolve, reject) => {
  const socket = createServer()
  socket.on('error', reject)
  socket.listen(0, '127.0.0.1', () => {
    const selected = socket.address().port
    socket.close(() => resolve(selected))
  })
})
const browserArgs = [
  '--headless=new', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run',
  '--remote-debugging-port=' + port, '--user-data-dir=' + profile, 'about:blank'
]
// Only disable sandbox for isolated CI/root-run QA, never in a personal browser.
if (process.env.CI === 'true' || (typeof process.getuid === 'function' && process.getuid() === 0)) browserArgs.unshift('--no-sandbox')
const chrome = spawn(executable, browserArgs, { stdio: ['ignore', 'ignore', 'pipe'] })
let browserStderr = ''
chrome.stderr?.on('data', chunk => { browserStderr = (browserStderr + chunk.toString()).slice(-3000) })
let ws
try {
  let tab
  for (let i = 0; i < 120; i++) {
    if (chrome.exitCode !== null) throw Error('Chromium exited before connecting. ' + browserStderr)
    try {
      const response = await fetch('http://127.0.0.1:' + port + '/json/list')
      if (response.ok) {
        const targets = await response.json()
        tab = Array.isArray(targets) ? targets.find(target => target.type === 'page' && target.webSocketDebuggerUrl) : null
        if (tab) break
      }
    } catch {}
    await delay(150)
  }
  assert.ok(tab?.webSocketDebuggerUrl, 'Could not open a Chromium debugging target. ' + browserStderr)
  ws = new WebSocket(tab.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })
  let sequence = 0
  const pending = new Map()
  const exceptions = []
  ws.addEventListener('message', event => {
    const item = JSON.parse(event.data)
    if (item.method === 'Runtime.exceptionThrown') exceptions.push(item.params?.exceptionDetails?.text || 'Browser exception')
    if (!pending.has(item.id)) return
    const [resolve, reject] = pending.get(item.id)
    pending.delete(item.id)
    item.error ? reject(Error(item.error.message)) : resolve(item.result)
  })
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence
    pending.set(id, [resolve, reject])
    ws.send(JSON.stringify({ id, method, params }))
  })
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true })
    if (result.exceptionDetails) throw Error('Browser JavaScript evaluation failed.')
    return result.result.value
  }
  async function wait(expression) {
    for (let i = 0; i < 80; i++) {
      try { if (await evaluate(expression)) return } catch {}
      await delay(100)
    }
    throw Error('Browser timed out waiting for: ' + expression)
  }
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Page.navigate', {url: base.href})
  await wait("document.querySelectorAll('.workspaceNavLink').length===9")
  const nav = await evaluate("[...document.querySelectorAll('.workspaceNavLink')].map(n=>n.getAttribute('aria-label'))")
  assert.deepEqual(nav, ['MCP','API','Projects','Agents','Prompts','Pinned','All Chats','Archived','Settings'])
  await evaluate("document.querySelector('.workspaceNavLink[aria-label=Projects]').click()")
  await wait("document.querySelector('.workspacePage h1')?.textContent==='Projects'")
  await evaluate("document.querySelector('input[aria-label=\"Project name\"]').focus()")
  await send('Input.insertText', { text: 'Browser QA Project' })
  await evaluate("document.querySelector('.workspaceProjectActions button[type=submit]').click()")
  await wait("document.querySelector('.projectStudioHeader h2')?.textContent==='Browser QA Project'")
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('workspace-ai-workspace-v1'))?.projects?.some(p=>p.name==='Browser QA Project')"), true)
  await evaluate("document.querySelector('.workspaceNavLink[aria-label=Projects]').click()")
  await wait("document.querySelector('.projectNavJump[title=\"Browser QA Project\"]')!==null")
  await evaluate("document.querySelector('.projectNavJump[title=\"Browser QA Project\"]').click()")
  await wait("document.querySelector('.projectStudioHeader h2')?.textContent==='Browser QA Project'")
  await evaluate("document.querySelector('.sidebarCollapse').click()")
  await wait("document.querySelector('.workspaceSidebar').classList.contains('compact')")
  assert.equal(await evaluate("document.querySelector('.workspaceSidebar').classList.contains('compact')"), true)
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('workspace-ai-workspace-v1')).collapsed"), true)
  await evaluate("document.querySelector('.workspaceNavLink[aria-label=API]').click()")
  await wait("document.querySelector('.workspacePage h1')?.textContent==='API integrations'")
  const expectedApiServices = SERVICES.filter(service => service.kind === 'api').length
  await wait("document.querySelectorAll('.workspaceCards .workspaceCard').length===" + expectedApiServices)
  const apiServices = await evaluate("document.querySelectorAll('.workspaceCards .workspaceCard').length")
  assert.equal(apiServices, expectedApiServices)
  await evaluate("document.querySelector('.workspaceNavLink[aria-label=MCP]').click()")
  await wait("document.querySelector('.workspacePage h1')?.textContent==='MCP connections'")
  const expectedMcpServices = SERVICES.filter(service => service.kind === 'mcp').length
  await wait("document.querySelectorAll('.workspaceCards .workspaceCard').length===" + expectedMcpServices)
  const mcpServices = await evaluate("document.querySelectorAll('.workspaceCards .workspaceCard').length")
  assert.equal(mcpServices, expectedMcpServices)
  await send('Emulation.setDeviceMetricsOverride', { width: 430, height: 880, deviceScaleFactor: 1, mobile: true })
  await send('Page.reload', { ignoreCache: true })
  // Reload starts in Chat, whose top bar deliberately has no mobile menu.
  // Enter a workspace section before exercising the responsive drawer.
  await wait("document.querySelector('.workspaceNavLink[aria-label=API]')!==null")
  await evaluate("document.querySelector('.workspaceNavLink[aria-label=API]').click()")
  await wait("document.querySelector('.workspacePage h1')?.textContent==='API integrations'")
  await wait("document.querySelector('.menu')!==null")
  await evaluate("document.querySelector('.menu').click()")
  await wait("document.querySelector('.workspaceSidebar').classList.contains('open')")
  assert.equal(await evaluate("document.querySelector('.workspaceSidebar').classList.contains('open')"), true)
  await evaluate("document.querySelector('.workspaceNavLink[aria-label=API]').click()")
  await wait("!document.querySelector('.workspaceSidebar').classList.contains('open')")
  assert.equal(await evaluate("document.querySelector('.workspaceSidebar').classList.contains('open')"), false)
  assert.ok((await evaluate('document.documentElement.scrollWidth-window.innerWidth')) < 6)
  assert.deepEqual(exceptions, [], 'Uncaught browser exceptions during navigation QA')
  console.log(JSON.stringify({ passed: true, sidebarSections: nav.length, apiServices, mcpServices, mobileDrawer: 'passed', browserExceptions: 0 }))
} finally {
  try { ws?.close() } catch {}
  chrome.kill('SIGTERM')
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {})
}
