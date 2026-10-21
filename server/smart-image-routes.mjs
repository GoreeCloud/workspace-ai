// Explicit user-initiated REST calls only; no autonomous agent grant.
import {normalizeImageRequest,providerModelFor} from '../src/smart-image-policy.js';
import {createHash} from 'node:crypto';
const API='https://api.ideogram.ai/v2/image/generate/';
const ALLOWED=new Set(['ideogram-4-5','nano-banana-2-1','gpt-image-2-5-flare','gpt-image-2-5-sunburst']);
// Explicit 1K output presets: Ideogram 4.5 accepts 'size', not 'aspect_ratio'.
// These values are bounded to advertised text-to-image size presets.
export const IDEOGRAM_45_SIZES=Object.freeze({'1:1':'1024x1024','16:9':'1280x720','9:16':'720x1280','4:3':'1152x864','3:4':'864x1152'});
export function safeImageUrl(value){
 if(typeof value!=='string'||value.length>2048)return null;
 try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(u.hostname==='ideogram.ai'||u.hostname.endsWith('.ideogram.ai'))?u.href:null}catch{return null}
}
export function buildImageRequest(payload){
 const request=normalizeImageRequest(payload),id=providerModelFor(request);
 if(!ALLOWED.has(id))throw Error('Unsupported provider model.');
 const body={prompt:request.prompt,num_images:request.numImages,async:false};
 if(request.aspectRatio!=='auto'){
  if(id==='ideogram-4-5')body.size=IDEOGRAM_45_SIZES[request.aspectRatio];
  else body.aspect_ratio=request.aspectRatio;
 }
 if((id==='ideogram-4-5'||id.startsWith('gpt-image-2-5'))&&/transparent|alpha channel|cutout|no background/i.test(request.prompt))body.background='transparent';
 if(id==='ideogram-4-5')body.quality=request.priority==='quality'?'high':request.priority==='speed'?'low':'medium';
 else if(id==='nano-banana-2-1')body.resolution_tier=request.priority==='quality'?'2K':'1K';
 else body.quality=request.priority==='speed'?'low':request.priority==='quality'?'high':'medium';
 return {request,id,body,url:API+id};
}
async function readBounded(response){
 if(Number(response.headers?.get?.('content-length'))>512000)throw Error('Oversized provider reply.');
 if(!response.body)return response.json();
 const chunks=[];let count=0;
 for await(const c of response.body){count+=c.byteLength;if(count>512000)throw Error('Oversized provider reply.');chunks.push(Buffer.from(c))}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export async function callIdeogram({key,request,dryRun=false,fetchImpl=fetch}={}){
 if(typeof key!=='string'||!key.trim())throw Object.assign(Error('Configure an Ideogram API key.'),{status:409});
 const plan=buildImageRequest(request);
 let response;
 try{response=await fetchImpl(plan.url+(dryRun?'?dry_run=true':''),{
  method:'POST',redirect:'error',headers:{'Api-Key':key,'Content-Type':'application/json',Accept:'application/json'},
  body:JSON.stringify(plan.body),signal:AbortSignal.timeout(120000)
 })}catch{throw Object.assign(Error('Image provider unavailable or timed out.'),{status:503})}
 let result;try{result=await readBounded(response)}catch{throw Object.assign(Error('Invalid or oversized provider response.'),{status:502})}
 if(!response.ok){const status=[401,402,429].includes(response.status)?response.status:502;
  throw Object.assign(Error(status===401?'Invalid provider key.':status===402?'Image credits are unavailable.':status===429?'Image provider rate limited.':'Image provider request failed.'),{status})}
 const common={model:plan.request.route.selected,providerModel:plan.id,route:plan.request.route};
 if(dryRun)return {...common,dryRun:true,quote:result};
 if(!Array.isArray(result?.data))throw Object.assign(Error('No provider images returned.'),{status:502});
 const images=result.data.slice(0,plan.request.numImages).filter(x=>x&&x.is_image_safe!==false).map(x=>({url:safeImageUrl(x.url),resolution:typeof x.resolution==='string'?x.resolution.slice(0,40):null})).filter(x=>x.url);
 if(!images.length)throw Object.assign(Error('No safely previewable provider image returned.'),{status:502});
 return {...common,dryRun:false,images,generationId:typeof result.generation_id==='string'?result.generation_id.slice(0,120):null};
}
export function attachSmartImageRoutes(app,origins,{environmentKey=process.env.WORKSPACE_IDEOGRAM_API_KEY||'',invoke=callIdeogram}={}){
 let sessionKey=null,active=0,credentialRevision=0;
 // Hold only a credential-scoped digest while a paid generation is in flight.
 const activeGenerations=new Set();
 const key=()=>sessionKey||environmentKey;
 const status=()=>({configured:!!key(),source:sessionKey?'session':environmentKey?'environment':null,
  models:['ideogram-4-5','gpt-image-2-5','nano-banana-2-1']});
 const allowed=(req,res)=>{if(origins.has(req.headers.origin))return true;
  res.status(403).json({error:'Origin not allowed.'});return false};
 app.get('/api/smart-images/status',(_req,res)=>res.json(status()));
 app.post('/api/smart-images/credential',(req,res)=>{
  if(!allowed(req,res))return;
  const value=req.body?.key;
  if(typeof value!=='string'||value.length<20||value.length>512||/\s/.test(value))
   return res.status(400).json({error:'Invalid Ideogram API key.'});
  sessionKey=value;credentialRevision++;res.json(status());
 });
 app.delete('/api/smart-images/credential',(req,res)=>{
  if(!allowed(req,res))return;sessionKey=null;credentialRevision++;res.json(status());
 });
 for(const dryRun of [true,false])app.post(dryRun?'/api/smart-images/quote':'/api/smart-images/generate',async(req,res)=>{
  if(!allowed(req,res))return;
  if(!key())return res.status(409).json({error:'Configure an Ideogram key first.'});
  let request;try{request=normalizeImageRequest(req.body)}catch(e){return res.status(400).json({error:e.message})}
  const credential=key(),issuedRevision=credentialRevision;
  const operationId=dryRun?null:createHash('sha256').update(JSON.stringify([credential,issuedRevision,request])).digest('hex');
  if(operationId&&activeGenerations.has(operationId))return res.status(409).json({error:'An identical image generation is already running. Wait for its result before trying again.'});
  if(active>=2)return res.status(429).json({error:'Too many concurrent image requests.'});
  if(operationId)activeGenerations.add(operationId);
  active++;
  try {const result=await invoke({key:credential,request,dryRun});
   if(key()!==credential||credentialRevision!==issuedRevision)return res.status(409).json({error:'Credential changed during generation.'});
   return res.json(result);
  }catch(e){return res.status(e.status||502).json({error:String(e.message||'Image request failed.').slice(0,210)})}
  finally {active--;if(operationId)activeGenerations.delete(operationId);}
 });
 return {clearSession(){sessionKey=null;credentialRevision++},activeCount(){return active}};
}
