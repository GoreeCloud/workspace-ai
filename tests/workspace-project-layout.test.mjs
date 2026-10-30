import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = name => readFile(new URL('../' + name, import.meta.url), 'utf8')

test('project overview separates navigation from advanced configuration', async () => {
  const [directory, editor, stylesheet] = await Promise.all([
    read('src/WorkspaceViews.jsx'), read('src/ProjectStudio.jsx'), read('src/workspace.css')
  ])
  assert.match(directory, /projectOverviewGrid/)
  assert.match(directory, /projectConversationHeading/)
  assert.match(directory, /Search this project/)
  assert.match(directory, /setCreateOpen/)
  assert.match(editor, /projectSettingsDisclosure/)
  assert.match(editor, /projectAdvancedServices/)
  assert.match(stylesheet, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/)
  assert.match(stylesheet, /@media\(max-width:950px\)/)
})

test('Agent Studio supervised task and provider controls have separate responsive fields', async () => {
  const [studio, css] = await Promise.all([read('src/AgentStudio.jsx'), read('src/workspace.css')])
  for (const expected of ['agentExecutionFields','agentTaskField','agentExecutionControls','agentSynthesisOption'])
    assert.ok(studio.includes(expected))
  assert.match(css, /\.agentExecutionFields/)
  assert.match(css, /max-width:950px/)
})

test('settings expose sign-in errors and do not imply unverified keys are connected', async () => {
  const [app, css] = await Promise.all([read('src/App.jsx'), read('src/ui-refresh.css')])
  assert.match(app, /setAuthError\(report\(e\)\)/)
  assert.match(app, /Saved · unverified/)
  assert.match(app, /Connection unavailable/)
  assert.match(css, /\.dialogBody\{overflow-y:auto/)
})
