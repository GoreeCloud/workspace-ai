// GoreeCloud Image Studio: local-first provider gateway; API keys never reach browser.
// No ChatGPT subscription token is used for paid image inference.
const RATIOS = Object.freeze({'1:1':'1024x1024','3:2':'1536x1024','2:3':'1024x1536'})
const OPENAI=['gpt-image-2.5-flare','gpt-image-2.5-sunburst']
const GOOGLE=['gemini-3.1-flash-image','gemini-nano-banana-2.1']
const MAX_INPUT=4*1024*1024,MAX_OUTPUT=16*1024*1024
const mimePattern=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/
const error=(message,status=400)=>Object.assign(Error(message),{status})
export function decodeImageData(value,maxBytes=MAX_INPUT){
 if(typeof value!=='string'||value.length>Math.ceil(maxBytes*4/3)+128)throw error('Image exceeds size limit.')
 const match=mimePattern.exec(value)
 if(!match)throw error('Use PNG, JPEG, or WebP images.')
 const bytes=Buffer.from(match[2],'base64')
 if(!bytes.length||bytes.length>maxBytes||bytes.toString('base64')!==match[2])throw error('Invalid image encoding.')
 const kind=match[1]
 const matchSignature=kind==='png'&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||
 kind==='jpeg'&&bytes.subarray(0,3).equals(Buffer.from([255,216,255]))||
 kind==='webp'&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'
 if(!matchSignature)throw error('Image signature and type do not match.')
 return {type:'image/'+kind,bytes,base64:match[2],dataUrl:value}
}
export function validateImageRequest(body){
 if(!body||typeof body!=='object'||Array.isArray(body))throw error('Invalid image request.')
 const prompt=typeof body.prompt==='string'?body.prompt.trim():''
 if(!prompt||prompt.length>4000)throw error('Prompt must contain 1–4000 characters.')
 if(!['openai','google'].includes(body.provider))throw error('Choose OpenAI or Google.')
 const model=body.model|| (body.provider==='openai'?OPENAI[0]:GOOGLE[0])
 if(!(body.provider==='openai'?OPENAI:GOOGLE).includes(model))throw error('Image model is not approved.')
 if(!Object.hasOwn(RATIOS,body.aspect))throw error('Unsupported aspect ratio.')
 if(body.image!=null&&typeof body.image!=='string')throw error('Invalid reference image.')
 const reference=body.image?decodeImageData(body.image):null
 const transparent=body.transparent===true
 if(transparent&&body.provider!=='openai')throw error('Transparency is not supported by the Google adapter.')
 return {provider:body.provider,model,prompt,aspect:body.aspect,size:RATIOS[body.aspect],transparent,reference}
}
const makeOutput=(data,mime='image/png')=>decodeImageData(data?.startsWith('data:image/')?data:'data:'+mime+';base64,'+data,MAX_OUTPUT).dataUrl
async function checkedJson(response){
 const MAX_RESPONSE=Math.ceil(MAX_OUTPUT*4/3)+16384
 const length=Number(response.headers?.get?.('content-length')||0)
 if(length>MAX_RESPONSE)throw error('Provider response too large.',502)
 const chunks=[];let size=0
 if(response.body?.getReader){
  const reader=response.body.getReader()
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_RESPONSE)throw error('Provider response too large.',502);chunks.push(value)}}finally{reader.releaseLock()}
 }else{const t=await response.text();size=Buffer.byteLength(t);if(size>MAX_RESPONSE)throw error('Provider response too large.',502);chunks.push(Buffer.from(t))}
 const raw=Buffer.concat(chunks.map(x=>Buffer.from(x))).toString('utf8')
 if(!response.ok)throw error(response.status===429?'Image provider quota or rate limit reached.':response.status===401||response.status===403?'Image API credential or permission was rejected.':'Image provider returned HTTP '+response.status+'.',response.status===429?429:502)
 try{return JSON.parse(raw)}catch{throw error('Provider returned invalid JSON.',502)}
}
async function createOpenAI(input,key,signal,request){
 const payload={model:input.model,prompt:input.prompt,size:input.size,quality:'auto',background:input.transparent?'transparent':'opaque',output_format:'png'}
 let url='https://api.openai.com/v1/images/generations',headers={authorization:'Bearer '+key,'content-type':'application/json'},body=JSON.stringify(payload)
 if(input.reference){
  url='https://api.openai.com/v1/images/edits';const form=new FormData()
  form.set('image',new Blob([input.reference.bytes],{type:input.reference.type}),'reference.png')
  for(const [name,value] of Object.entries(payload))form.set(name,value)
  body=form;headers={authorization:'Bearer '+key}
 }
 const data=await checkedJson(await request(url,{method:'POST',headers,body,signal,redirect:'error'}))
 return makeOutput(data.data?.[0]?.b64_json)
}
async function createGoogle(input,key,signal,request){
 const parts=[{text:input.prompt}]
 if(input.reference)parts.push({inlineData:{mimeType:input.reference.type,data:input.reference.base64}})
 const payload={contents:[{role:'user',parts}],generationConfig:{responseModalities:['IMAGE'],imageConfig:{aspectRatio:input.aspect}}}
 const url='https://generativelanguage.googleapis.com/v1beta/models/'+input.model+':generateContent'
 const data=await checkedJson(await request(url,{method:'POST',headers:{'x-goog-api-key':key,'content-type':'application/json'},body:JSON.stringify(payload),signal,redirect:'error'}))
 const part=data.candidates?.flatMap(c=>c?.content?.parts||[]).find(p=>p?.inlineData?.data)
 if(!part)throw error('Google did not return an image; check prompt and safety settings.',502)
 return makeOutput(part.inlineData.data,part.inlineData.mimeType||'image/png')
}
export function imageProviders({openaiKey='',googleKey=''}){return [
 {id:'openai',name:'ChatGPT Image',ready:Boolean(openaiKey),model:OPENAI[0],models:OPENAI,message:openaiKey?'OpenAI Image API ready; separate usage charges may apply.':'Connect an OpenAI API key in Settings.'},
 {id:'google',name:'Nano Banana',ready:Boolean(googleKey),model:GOOGLE[0],models:GOOGLE,message:googleKey?'Gemini API key configured; separate charges may apply.':'Set GEMINI_API_KEY in the local environment.'}
]}
export function attachImageStudioRoutes(app,{getOpenaiKey=()=>'',readProfile,activeAccountId,env=process.env,request=fetch}={}){
 const providers=()=>imageProviders({openaiKey:getOpenaiKey(),googleKey:env.GEMINI_API_KEY?.trim()||''})
 let busy=false
 const authorize=handler=>async(req,res)=>{
  try{
   const identity=activeAccountId(await readProfile())
   if((req.headers['x-workspace-account-id']||null)!==identity)return res.status(409).json({error:'Active account changed. Reload Workspace AI.'})
   await handler(req,res)
  }catch(e){if(!res.headersSent)res.status(503).json({error:'Image Studio account verification unavailable.'})}
 }
 app.get('/api/image-studio/providers',authorize(async(req,res)=>res.json({providers:providers(),storage:'view-only'})))
 app.post('/api/image-studio/generate',authorize(async(req,res)=>{
  let input
  try{input=validateImageRequest(req.body)}catch(e){return res.status(e.status||400).json({error:e.message})}
  const state=providers().find(p=>p.id===input.provider)
  if(!state.ready)return res.status(409).json({error:state.message})
  if(busy)return res.status(429).json({error:'Finish the current image before starting another.'})
  busy=true
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),180000)
  const cancel=()=>abort.abort()
  req.on('aborted',cancel)
  try{
   const image=input.provider==='openai'?await createOpenAI(input,getOpenaiKey(),abort.signal,request):
     await createGoogle(input,env.GEMINI_API_KEY.trim(),abort.signal,request)
   if(!res.destroyed)res.json({image,provider:input.provider,model:input.model,aspect:input.aspect})
  }catch(e){
   if(!res.destroyed)res.status(e.name==='AbortError'?504:e.status||502).json({error:e.name==='AbortError'?'Image request cancelled or timed out.':String(e.message||'Image request failed.').slice(0,180)})
  }finally{clearTimeout(timer);req.off('aborted',cancel);busy=false}
 }))
}
