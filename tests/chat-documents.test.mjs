import test from 'node:test'
import assert from 'node:assert/strict'
import {documentIntent,latestDocument,normalizeDocumentSource,documentWritingPrompt} from '../src/chat-document-intent.js'
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

test('Word files generated from Markdown reopen and retain the document title',{timeout:30000},async()=>{
 const source='# GoreeCloud Integral Platform Systems\n\n## Overview\nPlatform systems connect services.'
 const file=await createChatDocument({format:'docx',title:'GoreeCloud Integral Platform Systems',source})
 assert.equal(file.format,'docx');assert.ok(file.bytes>1000)
 const {runDocumentWorker}=await import('../server/document-routes.mjs')
 const reopened=await runDocumentWorker({action:'open',name:file.name,base64:file.base64})
 assert.ok(reopened.model.paragraphs.some(p=>p.text==='GoreeCloud Integral Platform Systems'))
})

test('AI document prompt avoids unsupported table and embedded-image output',()=>{
 const prompt=documentWritingPrompt(documentIntent('Create a Word document about GoreeCloud'))
 assert.match(prompt,/pipe tables/)
 assert.match(prompt,/embedded images/)
})

test('output format wins over mentions of the source format in follow-ups',()=>{
 const previous={title:'Integral Platform',source:'# Integral Platform\n\nCanonical source.'}
 const samples=[
  ['Convert that Word document to PDF','pdf'],
  ['Create a Markdown version of that Word document','md'],
  ['Export the existing PDF document as a Word document','docx'],
  ['Turn that Markdown document into PDF','pdf'],
  ['Create a Word document about PDF document management','docx'],
 ]
 for(const [input,format] of samples){
  const intent=documentIntent(input,previous)
  assert.ok(intent,input)
  assert.equal(intent.format,format,input)
  if(/that|existing/.test(input)&&!input.includes('about'))assert.equal(intent.kind,'convert',input)
 }
 assert.equal(documentIntent('Create a document about PDF security'),null,'Topic alone must not determine output format')
})

test('generated PDF retains an extractable opening title',{timeout:30000},async()=>{
 const file=await createChatDocument({format:'pdf',title:'GoreeCloud Overview',source:'# GoreeCloud Overview\n\nSystem architecture and scope.'})
 assert.equal(file.format,'pdf')
 const {runDocumentWorker}=await import('../server/document-routes.mjs')
 const opened=await runDocumentWorker({action:'open',name:file.name,base64:file.base64})
 assert.ok(opened.model.pages.some(p=>p.text.includes('GoreeCloud Overview')))
})
test('rejects structurally valid-looking output that lost its title',async()=>{
 let calls=0
 const fake=async()=>++calls===1?{base64:Buffer.from('fake').toString('base64')}:
  {model:{paragraphCount:1,paragraphs:[{text:'Completely unrelated content'}]}}
 await assert.rejects(createChatDocument({format:'docx',title:'Systems',source:'# GoreeCloud Systems\n\nProper content.'},{convert:fake}),/did not retain/)
})
