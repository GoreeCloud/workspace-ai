import test from 'node:test'
import assert from 'node:assert/strict'
import {canApplyLinkedRefresh} from '../src/project-source-isolation.js'

const source={id:'1111',kind:'google-drive-file',name:'plan.md',fileId:'File_1234567890',linkedAt:21}
const make=(id='a',linkedSources=[source])=>({id,linkedSources})

test('a completed refresh applies only to its initiating Project',()=>{
 assert.equal(canApplyLinkedRefresh('a','a',make(),source),true)
 assert.equal(canApplyLinkedRefresh('b','a',make('b'),source),false)
 assert.equal(canApplyLinkedRefresh('a','b',make(),source),false)
 assert.equal(canApplyLinkedRefresh('a','a',make('a',[]),source),false)
 assert.equal(canApplyLinkedRefresh('a','a',null,source),false)
})
test('relinked or replaced sources reject stale file and folder snapshots',()=>{
 for(const replacement of [
  {...source,fileId:'Different_123456789'},
  {...source,name:'renamed.md'},
  {...source,kind:'dropbox-file',fileId:undefined,path:'/doc.md'},
  {...source,linkedAt:22}
 ])assert.equal(canApplyLinkedRefresh('a','a',make('a',[replacement]),source),false)
 const folder={id:'folder',kind:'dropbox-directory',name:'Docs',path:'/Docs',linkedAt:8}
 assert.equal(canApplyLinkedRefresh('a','a',make('a',[folder]),folder),true)
 assert.equal(canApplyLinkedRefresh('a','a',make('a',[{...folder,path:'/Private'}]),folder),false)
})
