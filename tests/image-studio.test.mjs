import test from 'node:test'
import assert from 'node:assert/strict'
import {decodeImageData,validateImageRequest,imageProviders,attachImageStudioRoutes} from '../server/image-studio.mjs'
const PNG='data:image/png;base64,'+Buffer.from([137,80,78,71,13,10,26,10,12,34,56]).toString('base64')
const base={prompt:'A careful landscape design',provider:'openai',model:'gpt-image-2.5-flare',aspect:'1:1'}
const server=(request=async()=>new Response(JSON.stringify({data:[{b64_json:PNG.split(',')[1]}]}),{status:200}))=>{
 const routes=new Map(),app={get:(path,fn)=>routes.set('GET '+path,fn),post:(path,fn)=>routes.set('POST '+path,fn)}
 attachImageStudioRoutes(app,{getOpenaiKey:()=> 'sample-api-key',env:{GEMINI_API_KEY:'private-google-key'},readProfile:async()=>({}),activeAccountId:()=>null,request})
 return async(method,path,body,headers={})=>{
  let status=200,value=null
  const req={headers:{...headers},body,on:()=>{},off:()=>{}}
  const res={headersSent:false,destroyed:false,status(code){status=code;return this},json(data){value=data;this.headersSent=true;return this}}
  await routes.get(method+' '+path)(req,res)
  return {status,value}
 }
}
test('model and prompt validation rejects unsupported or oversized input',()=>{
 assert.equal(validateImageRequest(base).model,'gpt-image-2.5-flare')
 assert.equal(validateImageRequest({...base,provider:'google',model:'gemini-nano-banana-2.1'}).model,'gemini-nano-banana-2.1')
 for(const patch of [{prompt:''},{prompt:'x'.repeat(4001)},{model:'gpt-image-1'},{provider:'other'},{aspect:'7:3'},{provider:'google',model:'gemini-3.1-flash-image',transparent:true}])assert.throws(()=>validateImageRequest({...base,...patch}))
})
test('reference input validates encoded bytes and MIME signatures',()=>{
 assert.equal(decodeImageData(PNG).type,'image/png')
 for(const value of [PNG.replace('png','jpeg'),'data:text/html;base64,PGh0bWw+','data:image/png;base64,abc!'])assert.throws(()=>decodeImageData(value))
 assert.throws(()=>decodeImageData(PNG,4))
})
test('provider catalog excludes secret values',()=>{
 const data=imageProviders({openaiKey:'secret-openai',googleKey:'secret-google'})
 assert.deepEqual(data.map(p=>p.ready),[true,true])
 assert.equal(JSON.stringify(data).includes('secret-'),false)
})
test('image provider status requires exact active account scope',async()=>{
 const call=server()
 const good=await call('GET','/api/image-studio/providers')
 assert.equal(good.status,200)
 const bad=await call('GET','/api/image-studio/providers',{}, {'x-workspace-account-id':'wrong'})
 assert.equal(bad.status,409)
})
test('OpenAI generation uses the supported image endpoint',async()=>{
 let requestArgs
 const call=server(async(url,opts)=>{requestArgs={url,opts};return new Response(JSON.stringify({data:[{b64_json:PNG.split(',')[1]}]}))})
 const result=await call('POST','/api/image-studio/generate',base)
 assert.equal(result.status,200)
 assert.equal(result.value.image,PNG)
 assert.equal(requestArgs.url,'https://api.openai.com/v1/images/generations')
 assert.equal(JSON.parse(requestArgs.opts.body).model,'gpt-image-2.5-flare')
})
test('reference editing uses multipart OpenAI edits endpoint',async()=>{
 let target
 const call=server(async(url,opts)=>{target={url,opts};return new Response(JSON.stringify({data:[{b64_json:PNG.split(',')[1]}]}))})
 const result=await call('POST','/api/image-studio/generate',{...base,image:PNG})
 assert.equal(result.status,200)
 assert.equal(target.url,'https://api.openai.com/v1/images/edits')
 assert.equal(target.opts.body instanceof FormData,true)
})
test('Google receives image instructions without exposing key in response',async()=>{
 let sent
 const call=server(async(url,opts)=>{
  sent={url,opts}
  return new Response(JSON.stringify({candidates:[{content:{parts:[{inlineData:{mimeType:'image/png',data:PNG.split(',')[1]}}]}}]}))
 })
 const result=await call('POST','/api/image-studio/generate',{...base,provider:'google',model:'gemini-3.1-flash-image'})
 assert.equal(result.status,200)
 assert.equal(result.value.image,PNG)
 assert.equal(sent.url.includes('gemini-3.1-flash-image:generateContent'),true)
 assert.equal(JSON.stringify(result.value).includes('private-google-key'),false)
})
test('missing API keys never initiate inference',async()=>{
 let calls=0;const routes={}
 const app={get:(key,fn)=>routes['GET '+key]=fn,post:(key,fn)=>routes['POST '+key]=fn}
 attachImageStudioRoutes(app,{getOpenaiKey:()=>'',readProfile:async()=>({}),activeAccountId:()=>null,env:{},request:async()=>{calls++;throw Error('No network')}})
 const req={headers:{},body:base,on:()=>{},off:()=>{}}
 let status;const res={status(c){status=c;return this},json(){},headersSent:false,destroyed:false}
 await routes['POST /api/image-studio/generate'](req,res)
 assert.equal(status,409);assert.equal(calls,0)
})
