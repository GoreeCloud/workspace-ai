import test from 'node:test'
import assert from 'node:assert/strict'
import {
 BACKUP_KIND,BACKUP_VERSION,BACKUP_MAX_CHATS,
 createWorkspaceBackup,parseWorkspaceBackup,prepareWorkspaceRestore,persistWorkspaceRestore
} from '../src/workspace-backup.js'

const chat=(id,projectId=null)=>({
 id,title:'Chat '+id,projectId,updatedAt:123,
 messages:[{id:id+'-u',role:'user',content:'Hello'},{id:id+'-a',role:'assistant',content:'World',provider:'plan',model:'test'}]
})
const workspace={projects:[{id:'project1',name:'Main',createdAt:12}],pinned:['a'],collapsed:false,expanded:{chats:true,pinned:true,projects:true}}
const backup=()=>createWorkspaceBackup([chat('a','project1')],workspace,new Date('2026-10-20T12:00:00.000Z'))

test('exports a portable versioned archive without incidental credentials',()=>{
 const data=backup()
 assert.equal(data.kind,BACKUP_KIND)
 assert.equal(data.version,BACKUP_VERSION)
 assert.equal(data.exportedAt,'2026-10-20T12:00:00.000Z')
 assert.equal(data.chats[0].messages[0].content,'Hello')
 assert.equal(data.workspace.pinned[0],'a')
 assert.equal(parseWorkspaceBackup(JSON.stringify(data)).chats[0].title,'Chat a')
 const polluted={...data,oauthToken:'do-not-export',chats:[{...data.chats[0],secretKey:'no',messages:[{...data.chats[0].messages[0],token:'no'}]}]}
 const cleaned=parseWorkspaceBackup(JSON.stringify(polluted))
 assert.equal(JSON.stringify(cleaned).includes('do-not-export'),false)
 assert.equal(JSON.stringify(cleaned).includes('secretKey'),false)
 assert.equal(JSON.stringify(cleaned).includes('token'),false)
})

test('rejects malformed and oversized backup data before restore',()=>{
 assert.throws(()=>parseWorkspaceBackup('not json'),/valid JSON/)
 assert.throws(()=>parseWorkspaceBackup(JSON.stringify({...backup(),version:5})),/Unsupported/)
 assert.throws(()=>parseWorkspaceBackup(JSON.stringify({...backup(),chats:[chat('a'),chat('a')]})),/Duplicate conversation/)
 const duplicateMessages={...chat('a'),messages:[{id:'same',role:'user',content:'One'},{id:'same',role:'assistant',content:'Two'}]}
 assert.throws(()=>parseWorkspaceBackup(JSON.stringify({...backup(),chats:[duplicateMessages]})),/Duplicate message ID/)
 assert.throws(()=>parseWorkspaceBackup(JSON.stringify({...backup(),chats:[{...chat('a'),messages:[{id:'1',role:'system',content:'bad'}]}]})),/role/)
 assert.throws(()=>parseWorkspaceBackup(JSON.stringify({...backup(),workspace:{...workspace,projects:[...workspace.projects,workspace.projects[0]]}})),/Duplicate project/)
 assert.throws(()=>parseWorkspaceBackup(JSON.stringify({...backup(),chats:Array.from({length:BACKUP_MAX_CHATS+1},(_,i)=>chat('c'+i))})),/limit/)
 assert.throws(()=>parseWorkspaceBackup(' '.repeat(12*1024*1024+1)),/too large/)
})

test('export rejects over-capacity chat history rather than silently losing conversations',()=>{
 const tooMany=Array.from({length:BACKUP_MAX_CHATS+1},(_,i)=>chat('c'+i))
 assert.throws(()=>createWorkspaceBackup(tooMany,{...workspace,pinned:[]}),/50-conversation limit/)
})

test('message identity validation is scoped to each conversation',()=>{
 const first={...chat('a'),messages:[{id:'shared',role:'user',content:'First'}]}
 const second={...chat('b'),messages:[{id:'shared',role:'assistant',content:'Second'}]}
 const result=parseWorkspaceBackup(JSON.stringify({...backup(),chats:[first,second]}))
 assert.equal(result.chats.length,2)
})

test('drops orphaned project and pin references on import',()=>{
 const data={...backup(),chats:[chat('a','missing')],workspace:{...workspace,pinned:['a','not-a-chat']}}
 const imported=parseWorkspaceBackup(JSON.stringify(data))
 assert.equal(imported.chats[0].projectId,null)
 assert.deepEqual(imported.workspace.pinned,['a'])
})

test('merge preserves local conflicting chats and imports new chats/projects/pins',()=>{
 const imported={...backup(),chats:[chat('a','project1'),chat('b','project1')],workspace:{...workspace,pinned:['a','b']}}
 const current=[{...chat('a'),title:'Local original'}]
 const merged=prepareWorkspaceRestore(current,{...workspace,projects:[{id:'local',name:'Local',createdAt:1}],pinned:['a']},imported,'merge')
 assert.equal(merged.addedChats,1)
 assert.equal(merged.skippedChats,1)
 assert.equal(merged.chats[0].title,'Local original')
 assert.deepEqual(merged.workspace.projects.map(p=>p.id),['local','project1'])
 assert.deepEqual(merged.workspace.pinned,['a','b'])
})

test('merge respects the 50-chat storage cap and replacement is explicit',()=>{
 const local=Array.from({length:50},(_,i)=>chat('local'+i))
 const merged=prepareWorkspaceRestore(local,workspace,backup(),'merge')
 assert.equal(merged.chats.length,50)
 assert.equal(merged.addedChats,0)
 assert.equal(merged.skippedChats,1)
 const replaced=prepareWorkspaceRestore(local,workspace,backup(),'replace')
 assert.deepEqual(replaced.chats.map(c=>c.id),['a'])
 assert.equal(replaced.skippedChats,0)
})

test('merge removes imported project links when project capacity is exhausted',()=>{
 const localProjects=Array.from({length:100},(_,i)=>({id:'local-'+i,name:'Local '+i,createdAt:1}))
 const result=prepareWorkspaceRestore([],{...workspace,projects:localProjects,pinned:[]},backup(),'merge')
 assert.equal(result.addedChats,1)
 assert.equal(result.workspace.projects.length,100)
 assert.equal(result.chats[0].projectId,null)
})

test('merging conflicting project IDs never reassigns imported chats or shares private notes',()=>{
 const local={...workspace,projects:[{id:'project1',name:'Local identity',createdAt:1}],pinned:[]}
 const incoming={...backup(),chats:[chat('imported','project1')],workspace:{...workspace,projects:[{...workspace.projects[0],shareMemoryWith:['project2']},{id:'project2',name:'New project',createdAt:2,shareMemoryWith:['project1']}],pinned:[]}}
 const merged=prepareWorkspaceRestore([],local,incoming,'merge')
 assert.equal(merged.chats[0].projectId,null)
 assert.equal(merged.workspace.projects[0].name,'Local identity')
 assert.equal(Object.hasOwn(merged.workspace.projects.find(p=>p.id==='project2'),'shareMemoryWith'),false)
})

test('failed storage writes attempt rollback and do not trigger app state changes',()=>{
 const state=new Map([['chat','before'],['workspace','metadata']])
 let fail=true
 const storage={
  getItem:key=>state.get(key)??null,
  setItem:(key,value)=>{if(key==='workspace'&&fail){fail=false;throw Error('Quota exceeded')}state.set(key,value)},
  removeItem:key=>state.delete(key)
 }
 const restored=prepareWorkspaceRestore([],workspace,backup(),'replace')
 assert.throws(()=>persistWorkspaceRestore(storage,'chat','workspace',restored),/Could not save/)
 assert.equal(state.get('chat'),'before')
 assert.equal(state.get('workspace'),'metadata')
 persistWorkspaceRestore(storage,'chat','workspace',restored)
 assert.deepEqual(JSON.parse(state.get('chat')).map(c=>c.id),['a'])
})

test('merge refuses to truncate oversized existing conversations',()=>{
 const local=Array.from({length:BACKUP_MAX_CHATS+1},(_,i)=>chat('local-'+i))
 const before=JSON.stringify(local)
 assert.throws(()=>prepareWorkspaceRestore(local,workspace,backup(),'merge'),/existing conversations exceed the 50-conversation limit/)
 assert.equal(JSON.stringify(local),before)
 assert.throws(()=>prepareWorkspaceRestore(null,workspace,backup(),'merge'),/existing conversations are unreadable/)
 assert.deepEqual(prepareWorkspaceRestore(local,workspace,backup(),'replace').chats.map(c=>c.id),['a'])
})

test('merge refuses to truncate oversized existing project metadata',()=>{
 const projects=Array.from({length:101},(_,i)=>({id:'local-'+i,name:'Local '+i,createdAt:1}))
 const localWorkspace={...workspace,projects,pinned:[]}
 const before=JSON.stringify(localWorkspace)
 assert.throws(()=>prepareWorkspaceRestore([],localWorkspace,backup(),'merge'),/existing projects exceed the 100-project limit/)
 assert.equal(JSON.stringify(localWorkspace),before)
})
