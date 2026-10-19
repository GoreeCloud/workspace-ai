import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const load = relative => readFile(new URL(relative, root), 'utf8')

test('GC UI tokens and consumer stylesheet are wired into the application', async () => {
  const [main, tokens, theme] = await Promise.all([
    load('src/main.jsx'), load('src/gc-ui-tokens.css'), load('src/ui-refresh.css')
  ])
  assert.match(main, /gc-ui-tokens\.css/)
  assert.match(main, /ui-refresh\.css/)
  for (const role of ['--gc-canvas', '--gc-surface', '--gc-brand', '--gc-radius-md', '--gc-control-min-height']) {
    assert.ok(tokens.includes(role), 'Missing semantic token ' + role)
  }
  assert.match(theme, /prefers-reduced-motion/)
  assert.match(theme, /prefers-reduced-transparency/)
  assert.match(theme, /forced-colors/)
  assert.match(theme, /max-width:580px/)
})

test('settings support theme selection and dialog keyboard containment', async () => {
  const source = await load('src/App.jsx')
  assert.match(source, /workspace-ai-theme/)
  assert.match(source, /data-mode/)
  assert.match(source, /appearance===value/)
  assert.match(source, /settingsTab!==/)
  assert.match(source, /aria-current=\{settingsTab===key/)
  assert.match(source, /aria-modal="true"/)
  assert.match(source, /aria-labelledby="settings-title"/)
  assert.match(source, /event\.key==='Escape'/)
  assert.match(source, /event\.key!=='Tab'/)
})

test('API key field is masked, revocable, and not persisted in browser storage', async () => {
  const [form, server] = await Promise.all([load('src/ConnectionField.jsx'), load('server/index.mjs')])
  assert.match(form, /type=\{show \? 'text' : 'password'\}/)
  assert.match(form, /\/api\/settings\/credential/)
  assert.match(form, /aria-describedby="api-key-help"/)
  assert.doesNotMatch(form, /localStorage|sessionStorage/)
  assert.match(server, /apiKeySource/)
  assert.match(server, /clearCredential/)
})
