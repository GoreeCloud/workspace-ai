import test from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {createChatDocument} from '../server/ai-document-routes.mjs'
import {runDocumentWorker} from '../server/document-routes.mjs'

const python=process.env.WORKSPACE_DOCUMENT_PYTHON||'python3'
const script=fileURLToPath(new URL('./test_markdown_pdf.py',import.meta.url))

test('Markdown PDF renderer preserves typography, safety and page flow',()=>{
 const r=spawnSync(python,['-I','-B',script],{encoding:'utf8',timeout:30000})
 assert.equal(r.status,0,r.stderr||r.error?.message)
 assert.match(r.stdout,/MARKDOWN_PDF_RENDER_PASS/)
})
test('Chat-created PDF converts Markdown headings and lists into readable PDF',{timeout:30000},async()=>{
 const source='# GoreeCloud Integral Platform Systems\n\n## Architecture\nThe platform **connects** subsystems.\n\n- Identity\n- Workflow automation'
 const created=await createChatDocument({format:'pdf',title:'GoreeCloud Integral Platform Systems',source})
 assert.equal(created.ok,true)
 assert.match(created.name,/\.pdf$/)
 const opened=await runDocumentWorker({action:'open',name:created.name,base64:created.base64})
 const fullText=opened.model.pages.map(page=>page.text).join(' ')
 assert.match(fullText,/GoreeCloud Integral Platform Systems/)
 assert.match(fullText,/Architecture/)
 assert.match(fullText,/Identity/)
 assert.ok(!fullText.includes('# GoreeCloud'))
})
