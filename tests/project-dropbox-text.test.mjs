import test from 'node:test'
import assert from 'node:assert/strict'
import {readDropboxText,validateDropboxTextPath} from '../server/dropbox-text.mjs'
import {DropboxReadError} from '../server/dropbox-reader.mjs'

test('Dropbox text import requires a safe path and text extension',()=>{
 assert.equal(validateDropboxTextPath('/Documents/notes.md'),'notes.md')
 for(const path of ['/../secret.md','relative.txt','/bad.png','/nested//bad.txt','/hi\\evil.md']){
  assert.throws(()=>validateDropboxTextPath(path),DropboxReadError)
 }
})
test('Dropbox import reads text without changing remote state or exposing tokens',async()=>{
 let inspected
 const fetchImpl=async(url,options)=>{
  inspected={url,method:options.method,redirect:options.redirect,path:JSON.parse(options.headers['Dropbox-API-Arg']).path}
  return new Response('Hello project',{status:200,headers:{'content-length':'13'}})
 }
 const result=await readDropboxText('test-session',{path:'/project.md'},fetchImpl)
 assert.equal(result.content,'Hello project')
 assert.equal(result.size,13)
 assert.equal(result.name,'project.md')
 assert.equal(result.source,'dropbox')
 assert.deepEqual(inspected,{url:'https://content.dropboxapi.com/2/files/download',method:'POST',redirect:'error',path:'/project.md'})
 assert.equal(JSON.stringify(result).includes('test-session'),false)
})
test('Dropbox import rejects unavailable credentials, oversize and binary content',async()=>{
 await assert.rejects(()=>readDropboxText('',{path:'/notes.md'}),/Connect/)
 await assert.rejects(()=>readDropboxText('session',{path:'/notes.md'},async()=>new Response('denied',{status:403})),/permission/)
 await assert.rejects(()=>readDropboxText('session',{path:'/notes.md'},async()=>new Response('x'.repeat(65000*2),{status:200})),/64 KB/)
 await assert.rejects(()=>readDropboxText('session',{path:'/notes.md'},async()=>new Response(new Uint8Array([0,1,2]),{status:200})),/Binary/)
})
