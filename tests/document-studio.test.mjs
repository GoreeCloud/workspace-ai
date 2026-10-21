import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createEngineeringWorkOrder,workOrderPrompt} from '../src/engineering-work-order.js'
import {parseCsv,documentKind,validDocumentName} from '../src/document-utils.js'
import {attachDocumentRoutes,runDocumentWorker} from '../server/document-routes.mjs'

test('GoreeCloud engineering work orders are scoped, exportable, and non-executing',()=>{
 const order=createEngineeringWorkOrder({repository:'GoreeCloud/workspace-ai',target:'android',project:'Launcher',goal:'Implement a truly native launcher with build and runtime verification.'})
 assert.equal(order.mode,'plan-only')
 assert.equal(order.limits.allowWrites,false)
 assert.equal(order.limits.allowDeployment,false)
 assert.equal(order.limits.parallelAgents,4)
 assert.equal(order.phases.length,8)
 assert.match(workOrderPrompt(order),/GoreeCloud\/workspace-ai/)
 assert.match(workOrderPrompt(order),/native build/)
 assert.throws(()=>createEngineeringWorkOrder({repository:'Other/workspace-ai',target:'android',goal:order.objective}),/GoreeCloud/)
 assert.throws(()=>createEngineeringWorkOrder({repository:'GoreeCloud/a',target:'invalid',goal:order.objective}),/target/)
})
test('safe local text formats and quoted CSV parsing',()=>{
 assert.equal(documentKind('requirements.md'),'text')
 assert.equal(documentKind('data.xlsx'),'binary')
 assert.equal(documentKind('../../data.xlsx'),null)
 assert.equal(validDocumentName('report.PDF'),true)
 assert.equal(validDocumentName('.env'),false)
 assert.deepEqual(parseCsv('Name,Note\nAlpha,"has, comma"\nBeta,"quoted ""word"""'),[
  ['Name','Note'],['Alpha','has, comma'],['Beta','quoted "word"']
 ])
})
test('document route is same-origin only and reports sanitized failures',async()=>{
 const calls=[]
 const app={post:(path,handler)=>calls.push({path,handler})}
 attachDocumentRoutes(app,new Set(['http://127.0.0.1:3031']),{convert:async()=>({ok:true,kind:'docx'})})
 const {handler}=calls[0]
 assert.equal(calls[0].path,'/api/documents/operate')
 const invoke=async origin=>{
  const res={code:200,result:null,status(code){this.code=code;return this},setHeader(){return this},json(obj){this.result=obj;return this}}
  await handler({headers:{origin},body:{action:'open',name:'x.docx'}},res)
  return res
 }
 assert.equal((await invoke('https://other.example')).code,403)
 assert.equal((await invoke('http://127.0.0.1:3031')).code,200)
 await assert.rejects(()=>runDocumentWorker({action:'open',name:'../secret.docx',base64:'YWJj'}),/Unsupported document request/)
 await assert.rejects(()=>runDocumentWorker({action:'open',name:'test.docx',base64:'!'}),/Invalid or oversized/)
})
test('Office and PDF create/open/edit roundtrip using stateless converter', {timeout:30000},async()=>{
 const python=process.env.WORKSPACE_DOCUMENT_PYTHON||'python3'
 const fixtures=[
  {name:'sample.docx',model:{paragraphs:['First paragraph','Second paragraph']},
   validate:model=>assert.equal(model.paragraphs[0].text,'First paragraph'),
   edit:{target:'paragraph',index:0,text:'Changed Word content'},find:'Changed Word content'},
  {name:'sample.pptx',model:{slides:[{title:'GoreeCloud',body:'Project status'}]},
   validate:model=>assert.ok(model.slides[0].shapes.some(s=>s.text==='GoreeCloud')),
   edit:{target:'shape',slide:0,shape:0,text:'Changed slide title'},find:'Changed slide title'},
  {name:'sample.xlsx',model:{sheets:[{name:'Sheet1',cells:[{address:'A1',value:'Name'},{address:'B1',value:'Value'}]}]},
   validate:model=>assert.equal(model.sheets[0].cells[0].value,'Name'),
   edit:{target:'cell',sheet:'Sheet1',address:'A1',value:'Updated'},find:'Updated'},
  {name:'sample.pdf',model:{text:'GoreeCloud PDF contents'},
   validate:model=>assert.match(model.pages[0].text,/GoreeCloud PDF contents/),
   edit:{target:'append',text:'Added page to PDF'},find:'Added page to PDF'}
 ]
 for(const f of fixtures){
  const created=await runDocumentWorker({action:'create',name:f.name,model:f.model},{python})
  assert.ok(created.bytes>200,f.name)
  const opened=await runDocumentWorker({action:'open',name:f.name,base64:created.base64},{python})
  f.validate(opened.model)
  const edited=await runDocumentWorker({action:'edit',name:f.name,base64:created.base64,changes:[f.edit]},{python})
  assert.ok(edited.bytes>200)
  const reopened=await runDocumentWorker({action:'open',name:f.name,base64:edited.base64},{python})
  assert.match(JSON.stringify(reopened.model),new RegExp(f.find))
 }
})
test('backend and frontend wire Document and Engineering Studio without model content forwarding',async()=>{
 const [app,server,views,navigation,sw]=await Promise.all([
  readFile(new URL('../src/DocumentStudio.jsx',import.meta.url),'utf8'),
  readFile(new URL('../server/index.mjs',import.meta.url),'utf8'),
  readFile(new URL('../src/WorkspaceViews.jsx',import.meta.url),'utf8'),
  readFile(new URL('../src/workspace-state.js',import.meta.url),'utf8'),
  readFile(new URL('../public/sw.js',import.meta.url),'utf8')
 ])
 assert.match(views,/if\(view==='documents'\)/)
 assert.match(views,/if\(view==='engineering'\)/)
 assert.match(server,/attachDocumentRoutes/)
 assert.match(server,/\/api\/documents/)
 assert.match(app,/Download file/)
 assert.match(app,/File\.arrayBuffer|file\.arrayBuffer/)
 assert.match(sw,/\/api\//)
 assert.match(navigation,/id:'documents'/)
})
