// Optional interactive QA for a running, loopback-bound Workspace AI server.
// Usage: CHROMIUM_EXECUTABLE=/path/to/chrome WORKSPACE_AI_BASE_URL=http://127.0.0.1:3031 npm run browser:smoke
import assert from 'node:assert/strict'
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
const chrome = spawn(executable, [
  '--headless=new', '--disable-gpu', '--disable-dev-shm-usage',
  '--remote-debugging-port=' + port, '--user-data-dir=' + profile, 'about:blank'
], { stdio: 'ignore' })
let ws
try {
  let tab
  for (let i = 0; i < 40; i++) {
    if (chrome.exitCode !== null) throw Error('Chromium exited before connecting.')
    try {
      const response = await fetch('http://127.0.0.1:' + port + '/json/new?' + encodeURIComponent(base.href), { method: 'PUT' })
      if (response.ok) { tab = await response.json(); break }
    } catch {}
    await delay(150)
  }
  assert.ok(tab?.webSocketDebuggerUrl, 'Could not launch a Chromium debugging target.')
  ws = new WebSocket(tab.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })
  let sequence = 0
  const pending = new Map()
  ws.addEventListener('message', event => {
    const item = JSON.parse(event.data)
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
  await send('Page.enable')
  await send('Runtime.enable')
  await delay(1400)
  const nav = await evaluate("[...document.querySelectorAll('.workspaceNavLink')].map(n=>n.textContent.trim())")
  assert.deepEqual(nav, ['MCP','API','Projects','Pinned','All Chats','Settings'])
  await evaluate("document.querySelector('.workspaceNavLink[aria-label=Projects]').click()")
  await delay(150)
  assert.equal(await evaluate("document.querySelector('.workspacePage h1')?.textContent"), 'Projects')
  await evaluate("document.querySelector('.workspaceProjectActions input').focus()")
  await send('Input.insertText', { text: 'Browser QA Project' })
  await evaluate("document.querySelector('.workspaceProjectActions button[type=submit]').click()")
  await delay(180)
  assert.ok(await evaluate("document.body.innerText.includes('Browser QA Project')"))
  await evaluate("document.querySelector('.workspaceNavLink[aria-label=Projects]').click()")
  await delay(100)
  await evaluate("[...document.querySelectorAll('.workspaceNavChildren button')].find(n=>n.title==='Browser QA Project').click()")
  await delay(160)
  assert.equal(await evaluate("document.querySelector('.workspacePageTop h2')?.textContent"), 'Browser QA Project')
  await evaluate("document.querySelector('.sidebarCollapse').click()")
  await delay(200)
  assert.equal(await evaluate("document.querySelector('.workspaceSidebar').classList.contains('compact')"), true)
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('workspace-ai-workspace-v1')).collapsed"), true)
  await evaluate("document.querySelector('.workspaceNavLink[aria-label=API]').click()")
  await delay(350)
  assert.equal(await evaluate("document.querySelector('.workspacePage h1')?.textContent"), 'API integrations')
  const apiServices = await evaluate("document.querySelectorAll('.workspaceCards .workspaceCard').length")
  assert.equal(apiServices, 7)
  await evaluate("document.querySelector('.workspaceNavLink[aria-label=MCP]').click()")
  await delay(350)
  assert.equal(await evaluate("document.querySelector('.workspacePage h1')?.textContent"), 'MCP connections')
  const mcpServices = await evaluate("document.querySelectorAll('.workspaceCards .workspaceCard').length")
  assert.equal(mcpServices, 3)
  await send('Emulation.setDeviceMetricsOverride', { width: 430, height: 880, deviceScaleFactor: 1, mobile: true })
  await send('Page.reload', { ignoreCache: true })
  await delay(500)
  await evaluate("document.querySelector('.menu').click()")
  await delay(120)
  assert.equal(await evaluate("document.querySelector('.workspaceSidebar').classList.contains('open')"), true)
  await evaluate("document.querySelector('.workspaceNavLink[aria-label=API]').click()")
  await delay(280)
  assert.equal(await evaluate("document.querySelector('.workspaceSidebar').classList.contains('open')"), false)
  assert.ok((await evaluate('document.documentElement.scrollWidth-window.innerWidth')) < 6)
  console.log(JSON.stringify({ passed: true, sidebarSections: nav.length, apiServices, mcpServices, mobileDrawer: 'passed' }))
} finally {
  try { ws?.close() } catch {}
  chrome.kill('SIGTERM')
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {})
}
