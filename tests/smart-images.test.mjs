import test from 'node:test'
import assert from 'node:assert/strict'
import {chooseImageModel,normalizeImageRequest,providerModelFor} from '../src/smart-image-policy.js'
import {buildImageRequest,safeImageUrl} from '../server/smart-image-routes.mjs'
test('auto selection and locked model',()=>{
 assert.equal(chooseImageModel({prompt:'A logo with lettering'}).selected,'ideogram-4-5')
 assert.equal(chooseImageModel({prompt:'A realistic portrait'}).selected,'gpt-image-2-5')
 assert.equal(chooseImageModel({prompt:'A storyboard'}).selected,'nano-banana-2-1')
 assert.equal(chooseImageModel({prompt:'A logo',model:'nano-banana-2-1'}).selected,'nano-banana-2-1')
 assert.throws(()=>normalizeImageRequest({prompt:'image',numImages:9}))
})
test('allowlisted endpoints and image results',()=>{
 const r=buildImageRequest({prompt:'A scenic photograph',model:'gpt-image-2-5',priority:'speed'})
 assert.ok(r.url.endsWith('/gpt-image-2-5-flare'))
 assert.equal(providerModelFor(r.request),'gpt-image-2-5-flare')
 assert.equal(safeImageUrl('https://evil.example/x.png'),null)
})
import {callIdeogram,attachSmartImageRoutes} from '../server/smart-image-routes.mjs'
test('provider dry-run and generation are distinct, never automatically repeated',async()=>{
 const requests=[]
 const fetchImpl=async(url,opts)=>{requests.push({url,opts});return new Response(JSON.stringify(url.includes('dry_run')?{price_usd:0.02}:{data:[{url:'https://ideogram.ai/sample.png',is_image_safe:true}]}),{status:200})}
 const request={prompt:'An artistic poster',model:'ideogram-4-5'}
 const quote=await callIdeogram({key:'test-key',request,dryRun:true,fetchImpl})
 const generated=await callIdeogram({key:'test-key',request,fetchImpl})
 assert.equal(quote.dryRun,true);assert.equal(generated.images.length,1)
 assert.equal(requests.length,2);assert.ok(requests[0].url.includes('dry_run=true'))
 assert.ok(!requests[1].url.includes('dry_run'))
})
test('provider responses cannot include off-site image addresses',()=>{
 assert.equal(safeImageUrl('https://evil.example/sample.png'),null)
 assert.equal(safeImageUrl('http://ideogram.ai/unsafe.png'),null)
 assert.ok(safeImageUrl('https://ideogram.ai/safe.png'))
})
test('credential revisions invalidate in-flight results even with the same environment key',async()=>{
 const map=new Map()
 const app={get:(p,f)=>map.set('GET '+p,f),post:(p,f)=>map.set('POST '+p,f),delete:(p,f)=>map.set('DELETE '+p,f)}
 let complete
 const routes=attachSmartImageRoutes(app,new Set(['http://127.0.0.1:3031']),{
  environmentKey:'environment-test-key',invoke:()=>new Promise(done=>{complete=done})
 })
 async function call(method,path,body){
  const res={statusCode:200,body:null,status(n){this.statusCode=n;return this},json(x){this.body=x;return this}}
  await map.get(method+' '+path)({headers:{origin:'http://127.0.0.1:3031'},body},res)
  return res
 }
 const pending=call('POST','/api/smart-images/generate',{prompt:'A beautiful image'})
 assert.equal(routes.activeCount(),1)
 routes.clearSession()
 complete({images:[{url:'https://ideogram.ai/image.png'}]})
 assert.equal((await pending).statusCode,409)
 assert.equal(routes.activeCount(),0)
})
