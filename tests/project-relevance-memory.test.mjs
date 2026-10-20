import test from 'node:test'
import assert from 'node:assert/strict'
import {projectContext,rankedProjectFiles,relevantExcerpt,inferenceMessages,PROJECT_CONTEXT_MAX} from '../src/project-context.js'
import {newProject,importLocalTextFile} from '../src/project-model.js'
import {appendReviewedMemory,memoryCandidateFromMessage} from '../src/project-memory.js'
import {checkMessages} from '../server/stream.mjs'

const file=(id,name,content)=>({id,name,content,source:'local',createdAt:1})
const fixture=()=>{
 const a={...newProject('a','Development'),instructions:'Give practical coding answers',memory:'Use the stable branch only',
  files:[file('1','general.md','General information on the app'),file('2','deploy.md','Unrelated first paragraph.\n'.repeat(110)+' Deployment needs health checks and a rollback. \n'.repeat(5))]}
 const b={...newProject('b','Finance'),memory:'Private financial notes',
  files:[file('3','costs.csv','Costs are private unless sharing is enabled')]}
 return {projects:[a,b]}
}
test('file excerpts prefer relevant matches beyond file beginnings',()=>{
 const f='History of the product. '.repeat(100)+'Database migration rollback instructions. '+ 'Tail text. '.repeat(100)
 const excerpt=relevantExcerpt(f,'migration rollback',500)
 assert.match(excerpt,/migration rollback instructions/i)
 assert.ok(excerpt.length<580)
})
test('rank file sources by question relevance without leaking unrelated projects',()=>{
 const workspace=fixture()
 const files=rankedProjectFiles(workspace,'a','How do I implement deployment rollback?')
 assert.equal(files[0].name,'deploy.md')
 assert.equal(files.some(f=>f.name==='costs.csv'),false)
 workspace.projects[1].shareFilesWith=['a']
 const shared=rankedProjectFiles(workspace,'a','private costs')
 assert.equal(shared[0].name,'costs.csv')
 assert.equal(shared[0].shared,true)
})
test('bounded context includes file source names while preserving default project isolation',()=>{
 const workspace=fixture()
 assert.equal(projectContext(workspace,null,'costs'),'')
 assert.doesNotMatch(projectContext(workspace,'a','health checks'),/Private financial/)
 const result=projectContext(workspace,'a','health checks')
 assert.match(result,/Development/)
 assert.match(result,/deploy\.md/)
 assert.match(result,/health checks/)
 assert.ok(result.length<=PROJECT_CONTEXT_MAX)
 workspace.projects[1].shareMemoryWith=['a']
 assert.match(projectContext(workspace,'a','notes'),/Private financial notes/)
})
test('inference history meets server limits and favors recent turns',()=>{
 const context='Context '.repeat(400)
 const history=Array.from({length:65},(_,i)=>({role:i%2===0?'user':'assistant',content:'Message '+i+' '+'.'.repeat(1000)}))
 history.push({role:'user',content:'What changed?'})
 const messages=inferenceMessages(history,context)
 assert.equal(messages[0].content,context)
 assert.equal(messages.at(-1).content,'What changed?')
 assert.ok(messages.length<=60)
 assert.ok(messages.reduce((sum,m)=>sum+m.content.length,0)<=50000)
 assert.ok(checkMessages(messages))
 assert.ok(messages.some(m=>m.content.includes('Message 64')))
 assert.ok(!messages.some(m=>m.content.includes('Message 0 ')))
})
test('manual memory review prevents empty notes, duplicates and overflow',()=>{
 assert.equal(memoryCandidateFromMessage('x'.repeat(1500)).length,1200)
 const first=appendReviewedMemory('','Agree on source verification.','QA notes')
 assert.match(first,/From chat "QA notes":/)
 assert.throws(()=>appendReviewedMemory(first,'Agree on source verification.','QA notes'),/already saved/)
 assert.throws(()=>appendReviewedMemory('', '  ','QA notes'),/Enter a memory/)
 assert.throws(()=>appendReviewedMemory('x'.repeat(3990),'A new note','QA notes'),/memory is full/)
 assert.match(appendReviewedMemory('','Avoid token leaks.','Risk\nReport'),/Risk Report/)
})
test('local imports reject non-UTF8 and binary contents before project storage',async()=>{
 const text='hello\nCafé'
 const good={name:'note.md',size:new TextEncoder().encode(text).length,arrayBuffer:async()=>new TextEncoder().encode(text).buffer}
 const imported=await importLocalTextFile(good)
 assert.equal(imported.content,text)
 await assert.rejects(()=>importLocalTextFile({name:'bad.md',size:2,arrayBuffer:async()=>new Uint8Array([0xff,0xfe]).buffer}),/not valid UTF-8/)
 await assert.rejects(()=>importLocalTextFile({name:'image.png',size:2,arrayBuffer:async()=>new Uint8Array([1,2]).buffer}),/Only supported/)
 await assert.rejects(()=>importLocalTextFile({name:'bin.md',size:1,arrayBuffer:async()=>new Uint8Array([0]).buffer}),/Binary/)
})
