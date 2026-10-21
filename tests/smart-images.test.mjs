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

test('duplicate paid generation is blocked while running, without blocking other prompts or later retries',async()=>{
 const handlers=new Map(),completions=[]
 const app={get:(p,h)=>handlers.set('GET '+p,h),post:(p,h)=>handlers.set('POST '+p,h),delete:(p,h)=>handlers.set('DELETE '+p,h)}
 const routes=attachSmartImageRoutes(app,new Set(['http://127.0.0.1:3031']),{
  environmentKey:'configured-test-key',invoke:()=>new Promise(resolve=>{completions.push(resolve)})
 })
 const run=async(prompt)=>{
  const res={statusCode:200,body:null,status(n){this.statusCode=n;return this},json(v){this.body=v;return this}}
  await handlers.get('POST /api/smart-images/generate')({
   headers:{origin:'http://127.0.0.1:3031'},body:{prompt}},res)
  return res
 }
 const first=run('A futuristic poster')
 assert.equal(routes.activeCount(),1)
 const duplicate=await run('A futuristic poster')
 assert.equal(duplicate.statusCode,409)
 assert.match(duplicate.body.error,/already running/)
 assert.equal(completions.length,1)
 const distinct=run('A different poster')
 assert.equal(routes.activeCount(),2)
 assert.equal(completions.length,2)
 completions[0]({images:[]});completions[1]({images:[]})
 assert.equal((await first).statusCode,200)
 assert.equal((await distinct).statusCode,200)
 assert.equal(routes.activeCount(),0)
 const retry=run('A futuristic poster')
 assert.equal(completions.length,3)
 completions[2]({images:[]})
 assert.equal((await retry).statusCode,200)
 assert.equal(routes.activeCount(),0)
})

test('Ideogram 4.5 uses supported exact size presets instead of unsupported aspect_ratio',()=>{
 const expected={'1:1':'1024x1024','16:9':'1280x720','9:16':'720x1280','4:3':'1152x864','3:4':'864x1152'}
 for(const [aspectRatio,size] of Object.entries(expected)){
  const plan=buildImageRequest({prompt:'An illustrated poster',model:'ideogram-4-5',aspectRatio})
  assert.equal(plan.body.size,size)
  assert.equal('aspect_ratio' in plan.body,false)
 }
 const auto=buildImageRequest({prompt:'A graphic',model:'ideogram-4-5',aspectRatio:'auto'})
 assert.equal('size' in auto.body,false)
 assert.equal('aspect_ratio' in auto.body,false)
})
test('Nano Banana 2.1 and GPT Image 2.5 retain their model-specific aspect_ratio',()=>{
 for(const model of ['nano-banana-2-1','gpt-image-2-5']){
  const plan=buildImageRequest({prompt:'A house in a garden',model,aspectRatio:'16:9'})
  assert.equal(plan.body.aspect_ratio,'16:9')
  assert.equal('size' in plan.body,false)
 }
})
test('transparent background is explicitly requested for supporting manually selected models',()=>{
 for(const model of ['ideogram-4-5','gpt-image-2-5']){
  const plan=buildImageRequest({prompt:'An icon with transparent background',model})
  assert.equal(plan.body.background,'transparent')
 }
 const plan=buildImageRequest({prompt:'An icon with transparent background',model:'nano-banana-2-1'})
 assert.equal('background' in plan.body,false)
})
