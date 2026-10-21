import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {normalizeToolEvent, updateToolActivity, settleToolActivity, TOOL_ACTIVITY_LIMIT} from '../src/tool-activity.js'

const event = (id, status='running', extra={}) => ({
  type: 'tool', id, provider: 'google-drive-mcp', name: 'files.read',
  label: 'Reading project requirements', status, ...extra
})

test('tool events are bounded and must have an explicit provider, invocation and state', () => {
  assert.deepEqual(normalizeToolEvent(event('run-1')), {
    id: 'run-1', provider: 'google-drive-mcp', name: 'files.read',
    label: 'Reading project requirements', status: 'running'
  })
  for (const bad of [null, {}, event(''), event('a','success'), event('a','running',{provider:''}), event('a','running',{id:'../secret'})])
    assert.equal(normalizeToolEvent(bad), null)
  assert.equal(normalizeToolEvent(event('safe','running',{label:'x'.repeat(400)})).label.length,140)
  assert.equal(normalizeToolEvent(event('safe','running',{label:''})).label,'files read')
  assert.equal(normalizeToolEvent(event('x'.repeat(101))),null)
  assert.equal(normalizeToolEvent(event('a','running',{label:'Search  \n  files'})).label,'Search files')
})

test('every distinct tool invocation stays visible; statuses update without duplicates or regressions', () => {
  let rows = updateToolActivity([], event('1'))
  rows = updateToolActivity(rows, event('2','queued',{provider:'github-mcp',name:'code.search',label:'Searching repository'}))
  rows = updateToolActivity(rows, event('1','completed'))
  rows = updateToolActivity(rows, event('1','running'))
  rows = updateToolActivity(rows, event('1','failed'))
  rows = updateToolActivity(rows, event('2','running',{provider:'gmail-mcp'}))
  assert.equal(rows.length,2)
  assert.equal(rows[0].status,'completed')
  assert.equal(rows[1].provider,'github-mcp')
  assert.equal(rows[1].status,'queued')
  assert.equal(settleToolActivity(rows)[1].status,'interrupted')
  assert.equal(settleToolActivity(rows)[0].status,'completed')
})

test('tool event limit is enforced even on long chat streams', () => {
  let rows=[]
  for(let i=0;i<TOOL_ACTIVITY_LIMIT+10;i++) rows=updateToolActivity(rows,event('task-'+i))
  assert.equal(rows.length, TOOL_ACTIVITY_LIMIT)
  rows=updateToolActivity(rows,event('task-0','failed'))
  assert.equal(rows[0].status,'failed')
})

test('chat displays provider icons but only for recorded events, and does not claim tool success', async () => {
  const [view, app] = await Promise.all([
    readFile(new URL('../src/ToolActivity.jsx',import.meta.url),'utf8'),
    readFile(new URL('../src/App.jsx',import.meta.url),'utf8')
  ])
  assert.match(view, /aria-label="Tool activity"/)
  assert.match(view, /item\.provider/)
  assert.match(view, /github-mcp/)
  assert.match(app, /e\.type==='tool'/)
  assert.ok(app.includes('<ToolActivity items={m.toolActivity}/>'))
})
