import test from 'node:test'
import assert from 'node:assert/strict'
import {attachImageStudioRoutes,validateImageRequest,decodeImageData} from '../server/image-studio.mjs'

const png='data:image/png;base64,'+Buffer.from([137,80,78,71,13,10,26,10,1,2,3]).toString('base64')
const input={prompt:'A simple forest landscape',provider:'openai',model:'gpt-image-2.5-flare',aspect:'1:1'}
function harness(request){
 const handlers={}
 const app={get:(name,handler)=>{handlers['GET '+name]=handler},post:(name,handler)=>{handlers['POST '+name]=handler}}
 attachImageStudioRoutes(app,{
  readProfile:async()=>({}),activeAccountId:()=>null,
  getOpenaiKey:()=> 'sample-private-api-key',
  env:{GEMINI_API_KEY:'another-private-api-key'},
  request
 })
 return async(body=input)=>{
  const req={headers:{},body,on:()=>{},off:()=>{}}
  const res={headersSent:false,destroyed:false,code:200,data:null,status(code){this.code=code;return this},json(data){this.data=data;this.headersSent=true;return this}}
  await handlers['POST /api/image-studio/generate'](req,res)
  return res
 }
}
test('provider errors preserve useful status but never expose credentials',async()=>{
 const invoke=harness(async()=>new Response(JSON.stringify({error:{message:'secret provider details'}}),{status:401}))
 const result=await invoke()
 assert.equal(result.code,502)
 assert.match(result.data.error,/credential|permission/)
 assert.doesNotMatch(JSON.stringify(result.data),/private-api-key|secret provider details/)
})
test('provider response cap rejects oversized results before JSON parsing',async()=>{
 const invoke=harness(async()=>new Response('x'.repeat(16*1024*1024*4/3+32768),{status:200}))
 const result=await invoke()
 assert.equal(result.code,502)
 assert.match(result.data.error,/too large/i)
})
test('response MIME mismatch is rejected instead of returned as an image',async()=>{
 const invoke=harness(async()=>new Response(JSON.stringify({data:[{b64_json:'PGh0bWw+PHNjcmlwdD4='}]})))
 const result=await invoke()
 assert.notEqual(result.code,200)
 assert.equal(result.data.image,undefined)
})
test('malformed image metadata cannot select an unsupported model',()=>{
 assert.throws(()=>validateImageRequest({...input,provider:'google',model:'fake-image-model'}))
 assert.throws(()=>decodeImageData('data:image/png;base64,PGh0bWw+'))
})
