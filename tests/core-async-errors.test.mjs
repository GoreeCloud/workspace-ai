import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

test('corrupt private profile fails closed without crashing core API routes', { timeout: 15_000 }, async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'workspace-ai-profile-error-'))
  const profileDirectory = path.join(home, '.config', 'workspace-ai')
  const socket = createServer()
  let child
  try {
    await mkdir(profileDirectory, { recursive: true, mode: 0o700 })
    await writeFile(path.join(profileDirectory, 'credentials.json'), '{"invalid":', { mode: 0o600 })
    await new Promise((resolve, reject) => socket.once('error', reject).listen(0, '127.0.0.1', resolve))
    const port = socket.address().port
    await new Promise(resolve => socket.close(resolve))

    const env = { ...process.env, HOME: home, WORKSPACE_AI_PORT: String(port), WORKSPACE_AI_ENABLE_SCHEDULED_AGENTS: 'false' }
    for (const key of ['OPENAI_API_KEY', 'WORKSPACE_AI_AGENT_OWNER_KEY', 'WORKSPACE_SYNC_OAUTH_CLIENT_IDS']) delete env[key]
    child = spawn(process.execPath, [fileURLToPath(new URL('../server/index.mjs', import.meta.url))], {
      cwd: home, env, stdio: 'ignore'
    })
    const base = `http://127.0.0.1:${port}`
    let ready = false
    for (let attempt = 0; attempt < 80; attempt++) {
      if (child.exitCode !== null) throw new Error('Backend terminated during startup')
      try {
        ready = (await fetch(base + '/api/agents/status')).ok
        if (ready) break
      } catch { /* Waiting for the isolated backend. */ }
      await new Promise(resolve => setTimeout(resolve, 75))
    }
    assert.ok(ready, 'Isolated backend did not become ready')

    const routes = [
      ['/api/status', undefined],
      ['/api/auth/start', undefined],
      ['/api/models', undefined],
      ['/api/chat', {
        method: 'POST',
        headers: { Origin: base, 'Content-Type': 'application/json' },
        body: JSON.stringify({ preference: 'api', messages: [{ role: 'user', content: 'Synthetic input' }], images: [] })
      }]
    ]
    for (const [route, options] of routes) {
      const response = await fetch(base + route, options)
      assert.equal(response.status, 503, route)
      assert.match(response.headers.get('content-type') || '', /application\/json/, route)
      assert.equal(response.headers.get('cache-control'), 'no-store', route)
      const result = await response.json()
      assert.equal(result.error, 'Workspace AI cannot access required local state.', route)
      assert.equal(child.exitCode, null, `Backend terminated after ${route}`)
    }
    const malformed = await fetch(base + '/api/chat', {
      method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: '{'
    })
    assert.equal(malformed.status, 400)
    assert.deepEqual(await malformed.json(), { error: 'Invalid JSON request body.' })
    const oversized = await fetch(base + '/api/chat', {
      method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'x'.repeat(540 * 1024) })
    })
    assert.equal(oversized.status, 413)
    assert.deepEqual(await oversized.json(), { error: 'Request body exceeds the size limit.' })
    assert.equal((await fetch(base + '/api/agents/status')).status, 200, 'Unrelated API availability survives profile failures')
  } finally {
    if (socket.listening) await new Promise(resolve => socket.close(resolve))
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM')
      await new Promise(resolve => {
        const timeout = setTimeout(() => child.kill('SIGKILL'), 1000)
        timeout.unref()
        child.once('exit', () => { clearTimeout(timeout); resolve() })
      })
    }
    await rm(home, { recursive: true, force: true })
  }
})
