import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import {readDropboxLinkedFolder,validateLinkedDropboxFolder} from '../server/dropbox-linked-folder.mjs'
import {DropboxReadError} from '../server/dropbox-reader.mjs'
import {attachDropboxReadRoute} from '../server/dropbox-routes.mjs'
import {fetchDropboxFolderSnapshot,replaceLinkedSnapshot,validateLinkedSource} from '../src/project-linked-source.js'
import {newProject,normalizeProject} from '../src/project-model.js'
const token='synthetic-dropbox-credential'
const f=(path,size=5)=>({'.tag':'file',name:path.split('/').at(-1),path_display:path,size})
const listed=(entries,has_more=false,cursor='')=>({ok:true,status:200,headers:{get:()=>null},text:async()=>JSON.stringify({entries,has_more,cursor})})
test('Dropbox recursive folder uses only fixed read API, bounded cursors, ordered files',async()=>{
 const requests=[],downloads=[]
 const fetchImpl=async(url,options)=>{
  requests.push([url,JSON.parse(options.body)])
  assert.equal(options.method,'POST');assert.equal(options.redirect,'error')
  assert.equal(options.headers.Authorization,'Bearer '+token)
  if(url.endsWith('/continue'))return listed([f('/Docs/Sub/b.md'),f('/Elsewhere/hidden.md')])
  return listed([f('/Docs/z.md'),{'.tag':'folder',path_display:'/Docs/Sub'},f('/Docs/image.png')],true,'next')
 }
 const reader=async(_token,{path})=>{downloads.push(path);return {content:'Text!',size:5}}
 const output=await readDropboxLinkedFolder(token,{path:'/Docs'},fetchImpl,reader)
 assert.equal(requests.length,2)
 assert.equal(requests[0][0],'https://api.dropboxapi.com/2/files/list_folder')
 assert.equal(requests[0][1].recursive,true)
 assert.equal(requests[1][1].cursor,'next')
 assert.deepEqual(output.files.map(x=>x.relativePath),['Sub/b.md','z.md'])
 assert.deepEqual(downloads,['/Docs/Sub/b.md','/Docs/z.md'])
 assert.equal(output.fullyScanned,true)
})
test('bad folders, cursor loops, unbounded scans and too many files fail closed',async()=>{
 for(const path of ['','/','/Docs/','Docs','/Docs/../secret','/Docs\\Other']){
  assert.throws(()=>validateLinkedDropboxFolder(path),DropboxReadError)
 }
 await assert.rejects(()=>readDropboxLinkedFolder(token,{path:'/Docs'},async()=>listed(Array.from({length:11},(_,i)=>f('/Docs/'+i+'.md')))),/ten supported/)
 let calls=0
 await assert.rejects(()=>readDropboxLinkedFolder(token,{path:'/Docs'},async()=>{
  calls++;return listed([],true,'duplicate')
 }),/cursor is invalid/)
 assert.equal(calls,2)
 await assert.rejects(()=>readDropboxLinkedFolder(token,{path:'/Docs'},async()=>listed(Array.from({length:101},(_,i)=>f('/Docs/'+i+'.bin')))),/invalid/)
})
test('folder snapshot retains old content when one file download fails',async()=>{
 const listedFiles=listed([f('/Docs/a.md'),f('/Docs/b.md')])
 const staged=['A']
 const read=async(_token,{path})=>{
  staged.push(path)
  if(path.endsWith('b.md'))throw new DropboxReadError(403,'Read revoked')
  return {content:'Hello',size:5}
 }
 await assert.rejects(()=>readDropboxLinkedFolder(token,{path:'/Docs'},async()=>listedFiles,read),/revoked/)
 const source={id:'12345678-0000-4000-8000-000000000000',kind:'dropbox-directory',path:'/Docs',name:'Docs',linkedAt:1}
 const previous=[{id:source.id+':a.md',name:'a.md',content:'Old',source:'linked-dropbox',linkId:source.id,relativePath:'a.md',createdAt:1}]
 assert.equal(previous[0].content,'Old')
 assert.strictEqual(replaceLinkedSnapshot(previous,source.id,[previous[0]]),previous)
})
test('linked folder frontend filters invalid response and stores valid files under one source',async()=>{
 const src={id:'12345678-0000-4000-8000-000000000000',kind:'dropbox-directory',name:'Docs',path:'/Docs',linkedAt:1}
 assert.deepEqual(validateLinkedSource(src),src)
 const fetcher=async(url,opts)=>{
  assert.equal(url,'/api/integrations/dropbox/read-folder-text')
  assert.equal(JSON.parse(opts.body).path,'/Docs')
  return {ok:true,json:async()=>({path:'/Docs',readOnly:true,fullyScanned:true,files:[{relativePath:'nested/a.md',content:'Hello',size:5}]})}
 }
 const snapshot=await fetchDropboxFolderSnapshot(src,fetcher)
 assert.equal(snapshot[0].name,'nested/a.md')
 assert.equal(snapshot[0].linkId,src.id)
 const normalized=normalizeProject({...newProject('p','Example'),linkedSources:[src],files:snapshot})
 assert.equal(normalized.linkedSources[0].kind,'dropbox-directory')
 assert.equal(normalized.files[0].source,'linked-dropbox')
 await assert.rejects(()=>fetchDropboxFolderSnapshot(src,async()=>({ok:true,json:async()=>({path:'/Docs',readOnly:true,fullyScanned:false,files:[]})})),/incomplete/)
 await assert.rejects(()=>fetchDropboxFolderSnapshot(src,async()=>({ok:true,json:async()=>({path:'/Docs',readOnly:true,fullyScanned:true,files:[{relativePath:'../escape.md',size:5,content:'Hello'}]})})),/invalid text/)
})
test('Dropbox folder HTTP route enforces origin and rejects changed session revisions',async()=>{
 let revision=1,credential=token,release,markStarted
 const pending=new Promise(resolve=>{release=resolve})
 const started=new Promise(resolve=>{markStarted=resolve})
 const app=express();app.use(express.json())
 attachDropboxReadRoute(app,{origins:new Set(['http://127.0.0.1:3031']),getToken:()=>credential,getRevision:()=>revision,invalidate:()=>{credential=null;revision++}},undefined,async()=>{markStarted();return pending})
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))})
 const url='http://127.0.0.1:'+server.address().port+'/api/integrations/dropbox/read-folder-text'
 const make=(origin)=>fetch(url,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({path:'/Docs'})})
 try{
  assert.equal((await make('https://other.example')).status,403)
  const original=make('http://127.0.0.1:3031')
  await started
  revision++
  release({path:'/Docs',files:[],readOnly:true,fullyScanned:true})
  assert.equal((await original).status,409)
 }finally{await new Promise(resolve=>server.close(resolve))}
})
