import test from 'node:test'
import assert from 'node:assert/strict'
import {newProject,normalizeProject,normalizeProjects} from '../src/project-model.js'
import {normalizeResourcePath,authorizeProjectMcpAccount} from '../src/project-mcp-accounts.js'
import {createProjectMemoryEntry,normalizeProjectMemoryEntries,exportProjectMemoryMarkdown} from '../src/project-memory-entries.js'
import {projectContext} from '../src/project-context.js'
import {createWorkspaceBackup,parseWorkspaceBackup,prepareWorkspaceRestore} from '../src/workspace-backup.js'

const account=(id,accountLabel,provider='todoist')=>({
 id,provider,accountLabel,connectionId:'conn_1234567890ABCDEF',enabled:true,read:true,write:false,
 resourceRoots:['/Teams/Alpha'],tools:['tasks.list']
})
test('new projects default to memory on, while explicitly disabled projects stay disabled',()=>{
 assert.equal(newProject('a','Alpha').memoryEnabled,true)
 assert.equal(normalizeProject({id:'legacy',name:'Legacy'}).memoryEnabled,true)
 assert.equal(normalizeProject({...newProject('off','Opt-out'),memoryEnabled:false}).memoryEnabled,false)
})
test('same project holds distinct accounts for one MCP integration without credential storage',()=>{
 const p=normalizeProject({...newProject('a','Alpha'),mcpAccounts:[
  account('first','goreecloud@gmail.com'),{...account('second','goreeboy@gmail.com'),connectionId:''}
 ]})
 assert.equal(p.mcpAccounts.length,2)
 assert.equal(p.mcpAccounts[0].accountLabel,'goreecloud@gmail.com')
 assert.equal(p.mcpAccounts[1].accountLabel,'goreeboy@gmail.com')
 assert.equal(p.mcpAccounts[1].connectionId,'')
 assert.equal('token' in p.mcpAccounts[0],false)
})
test('same connection can have unrelated per-project roots and tool permissions',()=>{
 const a=normalizeProject({...newProject('a','Alpha'),mcpAccounts:[account('a1','Shared','google-drive')]})
 const b=normalizeProject({...newProject('b','Beta'),mcpAccounts:[
  {...account('b1','Shared','google-drive'),resourceRoots:['/Teams/Beta']}
 ]})
 const verified=['conn_1234567890ABCDEF']
 const attrs={provider:'google-drive',toolName:'tasks.list',mode:'read',resourcePath:'/Teams/Alpha/file.txt',verifiedConnectionIds:verified}
 assert.equal(authorizeProjectMcpAccount({...attrs,project:a,accountId:'a1'}).allowed,true)
 assert.equal(authorizeProjectMcpAccount({...attrs,project:b,accountId:'b1'}).allowed,false)
 assert.equal(authorizeProjectMcpAccount({...attrs,project:a,accountId:'b1'}).allowed,false)
 assert.equal(authorizeProjectMcpAccount({...attrs,project:a,accountId:'a1',resourcePath:'/Teams/Alphabet/file.txt'}).allowed,false)
 assert.equal(authorizeProjectMcpAccount({...attrs,project:a,accountId:'a1',verifiedConnectionIds:[]}).allowed,false)
 assert.equal(authorizeProjectMcpAccount({...attrs,project:a,accountId:'a1',mode:'write'}).allowed,false)
})
test('malformed resource paths and duplicate account IDs fail closed',()=>{
 for(const value of ['Teams/Alpha','/Teams/../Beta','/Teams/./A','/Teams/%2e%2e/B','/Teams/one\\two'])assert.throws(()=>normalizeResourcePath(value))
 assert.throws(()=>normalizeProject({...newProject('a','A'),mcpAccounts:[account('first','X'),account('first','Y')]}),/Duplicate MCP account/)
 assert.equal(normalizeResourcePath('/Teams/Alpha/'),'/Teams/Alpha')
})
test('disabled memory never enters context and other project memories are excluded',()=>{
 const entry=createProjectMemoryEntry('Preference','Only project Alpha remembers this','memory_A')
 const a=normalizeProject({...newProject('a','Alpha'),memoryEntries:[entry]})
 const b=normalizeProject(newProject('b','Beta'))
 assert.match(projectContext({projects:[a,b]},'a'),/Only project Alpha/)
 assert.doesNotMatch(projectContext({projects:[a,b]},'b'),/Only project Alpha/)
 assert.doesNotMatch(projectContext({projects:[{...a,memoryEnabled:false},b]},'a'),/Only project Alpha/)
})
test('individual memory can be edited or deleted without affecting other projects',()=>{
 const first=createProjectMemoryEntry('One','first private note','id_one',1)
 const second=createProjectMemoryEntry('Two','second private note','id_two',2)
 const edited=normalizeProject({...newProject('a','Alpha'),memoryEntries:[{...first,content:'edited private note'},second]})
 const removed=normalizeProject({...edited,memoryEntries:edited.memoryEntries.filter(m=>m.id!=='id_one')})
 assert.equal(removed.memoryEntries.length,1)
 assert.equal(removed.memoryEntries[0].content,'second private note')
 const markdown=exportProjectMemoryMarkdown(edited)
 assert.match(markdown,/edited private note/)
 assert.match(markdown,/second private note/)
 assert.doesNotMatch(exportProjectMemoryMarkdown(removed),/edited private note/)
})
test('backups retain project boundaries but never include credential fields',()=>{
 const p=normalizeProject({...newProject('a','Alpha'),memoryEntries:[
  createProjectMemoryEntry('Goal','Alpha only','alpha_entry')
 ],mcpAccounts:[{...account('first','Personal'),token:'fake-secret-token',credentials:'fake-credentials'}]})
 const archive=createWorkspaceBackup([],{projects:[p],pinned:[],collapsed:false,expanded:{}})
 const text=JSON.stringify(archive)
 assert.doesNotMatch(text,/fake-secret-token|fake-credentials/)
 const imported=parseWorkspaceBackup(text)
 assert.equal(imported.workspace.projects[0].memoryEntries[0].content,'Alpha only')
 assert.equal(imported.workspace.projects[0].mcpAccounts[0].accountLabel,'Personal')
 const target=normalizeProject({...newProject('b','Beta'),mcpAccounts:[account('other','Other')]})
 const merged=prepareWorkspaceRestore([],{projects:[target],pinned:[],prompts:[],expanded:{}},archive,'merge')
 assert.equal(merged.workspace.projects[0].mcpAccounts[0].accountLabel,'Other')
 assert.equal(merged.workspace.projects[1].mcpAccounts[0].accountLabel,'Personal')
})
test('duplicate memory IDs, malformed entries and oversized records are rejected',()=>{
 const e=createProjectMemoryEntry('Test','Note','memory_one')
 assert.throws(()=>normalizeProjectMemoryEntries([e,e]),/Duplicate/)
 assert.throws(()=>createProjectMemoryEntry('Oversize','X'.repeat(1201),'valid_id'),/exceeds/)
 assert.throws(()=>normalizeProject({...newProject('a','A'),memoryEntries:[{id:'a',content:'no title'}]}),/title/)
})
