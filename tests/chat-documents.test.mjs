import test from 'node:test'
import assert from 'node:assert/strict'
import {documentIntent,latestDocument,normalizeDocumentSource} from '../src/chat-document-intent.js'
import {createChatDocument,validateDocumentRequest} from '../server/ai-document-routes.mjs'
test('creates named Word, PDF and Markdown intents',()=>{
 const r=documentIntent('Create a Word document about GoreeCloud Integral Platform Systems')
 assert.equal(r.kind,'create');assert.equal(r.format,'docx')
 assert.equal(r.filename,'GoreeCloud-Integral-Platform-Systems.docx')
 assert.equal(documentIntent('Make a PDF about security').format,'pdf')
 assert.equal(documentIntent('Hello'),null)
})
test('conversion uses last valid scoped source',()=>{
 const source='# GoreeCloud\n\n## Systems\nOriginal text'
 const previous=latestDocument([{role:'assistant',document:{title:'GoreeCloud',source}}])
 const r=documentIntent('Create a Markdown version of that document',previous)
 assert.equal(r.kind,'convert');assert.equal(r.source,source)
 assert.equal(r.filename,'GoreeCloud.md')
 assert.equal(documentIntent('Make a PDF version of that document').kind,'missing-source')
})
test('rejects invalid input, validates Markdown result',async()=>{
 const request={format:'md',title:'Example',source:'# Example\n\nValid body'}
 assert.equal(validateDocumentRequest(request).name,'Example.md')
 assert.throws(()=>validateDocumentRequest({...request,format:'exe'}))
 assert.throws(()=>normalizeDocumentSource('tiny'))
 const file=await createChatDocument(request)
 assert.equal(Buffer.from(file.base64,'base64').toString('utf8'),request.source+'\n')
 assert.equal(file.sha256.length,64)
})
