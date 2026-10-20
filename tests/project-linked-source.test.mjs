import test from 'node:test'
import assert from 'node:assert/strict'
import {scanSource,replaceLinkedSnapshot,validateLinkedSource,linkedFileId,MAX_LINKED_SOURCES} from '../src/project-linked-source.js'
import {newProject,normalizeProject} from '../src/project-model.js'
import {createWorkspaceBackup,parseWorkspaceBackup} from '../src/workspace-backup.js'
const source=(kind='file')=>({id:'12345678-0000-4000-8000-000000000000',kind,name:kind==='file'?'notes.md':'Selected',linkedAt:1})
const file=(content,name='notes.md')=>{
 const bytes=new TextEncoder().encode(content)
 return {name,size:bytes.byteLength,lastModified:123,arrayBuffer:async()=>bytes.buffer}
}
const fileHandle=(text,name='notes.md',permission='granted')=>({
 kind:'file',name,queryPermission:async()=>permission,getFile:async()=>file(text,name)
})
const directory=(children,permission='granted')=>({
 kind:'directory',queryPermission:async()=>permission,
 entries:async function*(){for(const [name,handle] of children)yield [name,handle]}
})
test('metadata defaults to no handles and strict source limit',()=>{
 assert.deepEqual(newProject('a','Project').linkedSources,[])
 assert.equal(MAX_LINKED_SOURCES,5)
 const s=source()
 assert.deepEqual(validateLinkedSource(s),s)
 assert.throws(()=>validateLinkedSource({...s,id:'../../escape'}),/Invalid/)
 assert.throws(()=>normalizeProject({...newProject('p','P'),linkedSources:Array.from({length:6},(_,i)=>({...s,id:String(i)}))}),/Too many/)
})
test('file handle produces validated read-only UTF8 reference',async()=>{
 const s=source()
 const files=await scanSource(fileHandle('Welcome 🌎'),s)
 assert.equal(files.length,1)
 assert.equal(files[0].content,'Welcome 🌎')
 assert.equal(files[0].source,'linked-local')
 assert.equal(files[0].id,linkedFileId(s.id,s.name))
 assert.equal(files[0].linkId,s.id)
 const p=normalizeProject({...newProject('p','P'),linkedSources:[s],files})
 assert.deepEqual(p.files[0].linkId,s.id)
 const archive=createWorkspaceBackup([],{projects:[p],pinned:[],collapsed:false,expanded:{projects:true,pinned:true,chats:true}})
 const restored=parseWorkspaceBackup(JSON.stringify(archive))
 assert.equal(restored.workspace.projects[0].files[0].content,'Welcome 🌎')
 assert.equal(restored.workspace.projects[0].linkedSources.length,1)
})
test('directory is recursively and deterministically scanned without following unsupported files',async()=>{
 const s=source('directory')
 const inner=directory([['z.md',fileHandle('Z','z.md')],['a.md',fileHandle('A','a.md')]])
 const root=directory([['nested',inner],['binary.png',fileHandle('image','binary.png')],['readme.txt',fileHandle('Text','readme.txt')]])
 const files=await scanSource(root,s)
 assert.deepEqual(files.map(f=>f.name),['nested/a.md','nested/z.md','readme.txt'])
})
test('revoke permission and invalid bytes fail without partial saved-state mutation',async()=>{
 await assert.rejects(()=>scanSource(fileHandle('data','notes.md','denied'),source()),/permission/i)
 const invalidBytes=new Uint8Array([0xff,0xfe])
 const corrupted={kind:'file',queryPermission:async()=> 'granted',getFile:async()=>({size:2,lastModified:1,arrayBuffer:async()=>invalidBytes.buffer})}
 await assert.rejects(()=>scanSource(corrupted,source()),/encoded|valid|utf-8/i)
 const stale=[{id:'other',source:'local',name:'manual.md',content:'Retain',createdAt:1}]
 const linked=[{...stale[0],id:linkedFileId(source().id,'old.md'),name:'old.md',linkId:source().id,source:'linked-local',relativePath:'old.md'}]
 const saved=[...stale,...linked]
 assert.strictEqual(replaceLinkedSnapshot(saved,source().id,[linked[0]]),saved)
 assert.deepEqual(replaceLinkedSnapshot(saved,source().id,[]),stale)
})
test('over quota snapshots preserve existing content and allow source removal',()=>{
 const s=source()
 const first={id:linkedFileId(s.id,'a.md'),name:'a.md',content:'Old',linkId:s.id,source:'linked-local'}
 const existing=[first,...Array.from({length:9},(_,i)=>({id:String(i),name:'manual.md',content:'data',source:'local'}))]
 const updates=[first,{...first,id:linkedFileId(s.id,'b.md'),name:'b.md',content:'New'}]
 assert.throws(()=>replaceLinkedSnapshot(existing,s.id,updates),/ten reference files/)
 assert.equal(existing[0].content,'Old')
 assert.equal(replaceLinkedSnapshot(existing,s.id,[]).length,9)
})

test('connected Dropbox text can be linked and refreshed as a read-only source',async()=>{
 const {fetchDropboxSnapshot}=await import('../src/project-linked-source.js')
 const s={id:'ba7ae624-4699-4ca8-899c-570fb55db774',kind:'dropbox-file',name:'notes.md',path:'/Documents/notes.md',linkedAt:1}
 let called=0
 const fetcher=async(url,options)=>{
  called++
  assert.equal(url,'/api/integrations/dropbox/import-text')
  assert.equal(options.method,'POST')
  assert.equal(JSON.parse(options.body).path,s.path)
  return {ok:true,json:async()=>({name:'notes.md',size:5,content:called===1?'First':'Later'})}
 }
 const first=await fetchDropboxSnapshot(s,fetcher)
 assert.equal(first[0].source,'linked-dropbox')
 assert.equal(first[0].content,'First')
 const second=await fetchDropboxSnapshot(s,fetcher)
 assert.equal(second[0].content,'Later')
 assert.equal(second[0].id,first[0].id)
 const p=normalizeProject({...newProject('p','P'),linkedSources:[s],files:second})
 assert.equal(p.files[0].linkId,s.id)
})
test('Dropbox unlink or revoke never discards a prior snapshot on failed refresh',async()=>{
 const {fetchDropboxSnapshot}=await import('../src/project-linked-source.js')
 const source={id:'ba7ae624-4699-4ca8-899c-570fb55db774',kind:'dropbox-file',name:'notes.md',path:'/notes.md',linkedAt:1}
 const previous=[{id:source.id+':notes.md',name:'notes.md',content:'Retained text',source:'linked-dropbox',linkId:source.id,relativePath:'notes.md',createdAt:1}]
 await assert.rejects(()=>fetchDropboxSnapshot(source,async()=>({ok:false,json:async()=>({error:'Dropbox token revoked'})})),/revoked/)
 assert.equal(previous[0].content,'Retained text')
 await assert.rejects(()=>fetchDropboxSnapshot(source,async()=>({ok:true,json:async()=>({name:'image.png',size:5,content:'test'})})),/unsupported/)
 assert.throws(()=>validateLinkedSource({...source,path:'notes.md'}),/Invalid Dropbox source path/)
})
