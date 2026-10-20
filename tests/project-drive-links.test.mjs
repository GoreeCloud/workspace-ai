import test from 'node:test'
import assert from 'node:assert/strict'
import {validateLinkedSource,fetchDriveFileSnapshot,replaceLinkedSnapshot} from '../src/project-linked-source.js'
import {newProject,normalizeProject} from '../src/project-model.js'
const s={id:'f5f65193-85ab-4eb2-93af-caf7042026d0',kind:'google-drive-file',name:'notes.md',fileId:'A1234567890',linkedAt:1}
const resp=(content='Version one')=>({ok:true,json:async()=>({id:s.fileId,name:'notes.md',content,readOnly:true})})
test('Drive source metadata keeps ID without extra secrets',()=>{
 assert.deepEqual(validateLinkedSource({...s,token:'secret'}),s)
 assert.throws(()=>validateLinkedSource({...s,fileId:'../bad'}),/Invalid Google Drive/)
})
test('Drive read is bounded, identified and read-only',async()=>{
 const snapshot=await fetchDriveFileSnapshot(s,async(url,opts)=>{
  assert.equal(url,'/api/google/drive/read')
  assert.equal(opts.method,'POST')
  assert.deepEqual(JSON.parse(opts.body),{id:s.fileId})
  return resp()
 })
 assert.equal(snapshot[0].source,'linked-google-drive')
 assert.equal(snapshot[0].content,'Version one')
 const project=normalizeProject({...newProject('p','P'),linkedSources:[s],files:snapshot})
 assert.equal(project.files[0].linkId,s.id)
 assert.equal(project.linkedSources[0].fileId,s.fileId)
})
test('Drive changes refresh snapshot and failures leave last good copy',async()=>{
 const first=await fetchDriveFileSnapshot(s,async()=>resp())
 const next=await fetchDriveFileSnapshot(s,async()=>resp('Version two'))
 const prev=[{id:'manual',name:'manual.md',content:'Keep',source:'local'},...first]
 const merged=replaceLinkedSnapshot(prev,s.id,next)
 assert.equal(merged[0],prev[0])
 assert.equal(merged[1].content,'Version two')
 assert.deepEqual(replaceLinkedSnapshot(prev,s.id,first),prev)
 await assert.rejects(()=>fetchDriveFileSnapshot(s,async()=>({ok:false,json:async()=>({error:'secret'})})),/unavailable/)
 for(const item of [{id:'bad',name:'notes.md',content:'text',readOnly:true},{id:s.fileId,name:'binary.png',content:'x',readOnly:true},{id:s.fileId,name:'notes.md',content:'x'.repeat(65537),readOnly:true}]){
  await assert.rejects(()=>fetchDriveFileSnapshot(s,async()=>({ok:true,json:async()=>item})),/invalid/)
 }
 assert.equal(first[0].content,'Version one')
})
