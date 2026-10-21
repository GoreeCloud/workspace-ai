import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {createServer} from 'vite'

// Verify actual React markup, not just source-text contracts.
test('tool rows render compact icons and accessible labels for each recorded invocation',async()=>{
 const vite=await createServer({server:{middlewareMode:true},appType:'custom',logLevel:'silent'})
 try {
  const {default:ToolActivity}=await vite.ssrLoadModule('/src/ToolActivity.jsx')
  const items=[
   {id:'call-1',provider:'github-mcp',name:'repos.search',label:'Searching repository',status:'running'},
   {id:'call-2',provider:'google-drive-mcp',name:'files.read',label:'Reading instructions',status:'completed'},
   {id:'call-3',provider:'new-provider',name:'analyze',label:'Checking data',status:'failed'}
  ]
  const html=renderToStaticMarkup(React.createElement(ToolActivity,{items}))
  assert.match(html,/aria-label="Tool activity"/)
  assert.match(html,/aria-live="polite"/)
  assert.match(html,/tone-github/)
  assert.match(html,/tone-drive/)
  assert.match(html,/tone-default/)
  assert.match(html,/is-running/)
  assert.match(html,/is-completed/)
  assert.match(html,/is-failed/)
  for(const label of ['Searching repository','Reading instructions','Checking data','GitHub','Google Drive','In progress','Completed','Failed'])
   assert.ok(html.includes(label),'Missing '+label)
  assert.equal((html.match(/class="chatToolRow/g)||[]).length,3)
  assert.equal(renderToStaticMarkup(React.createElement(ToolActivity,{items:[]})),'')
 }finally{await vite.close()}
})
