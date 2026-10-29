import React,{useEffect,useRef,useState} from 'react'
import {ImagePlus,Images,Download,RotateCcw,Trash2,WandSparkles,AlertCircle,CheckCircle2,RefreshCw,ShieldCheck,Square} from 'lucide-react'
import {browserAccountScope} from './account-workspace-scope.js'
import './image-studio.css'
const RATIOS=[['1:1','Square'],['3:2','Landscape'],['2:3','Portrait']]
const imageFile=file=>new Promise((resolve,reject)=>{
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size<1||file.size>4*1024*1024)return reject(Error('Upload PNG, JPEG or WebP up to 4 MB.'))
 const reader=new FileReader();reader.onerror=()=>reject(Error('Unable to read image.'))
 reader.onload=()=>resolve(String(reader.result));reader.readAsDataURL(file)
})
async function checked(response){const data=await response.json().catch(()=>({error:'Invalid server response.'}));if(!response.ok)throw Error(data.error||'Image service unavailable.');return data}
export default function ImageStudio({onOpenSettings}){
 const [providers,setProviders]=useState([]),[loading,setLoading]=useState(true)
 const [provider,setProvider]=useState('openai'),[model,setModel]=useState('gpt-image-2.5-flare')
 const [prompt,setPrompt]=useState(''),[aspect,setAspect]=useState('1:1'),[transparent,setTransparent]=useState(false)
 const [reference,setReference]=useState(null),[results,setResults]=useState([])
 const [error,setError]=useState(''),[busy,setBusy]=useState(false)
 const file=useRef(null),pending=useRef(null)
 const account=browserAccountScope()
 const refresh=async()=>{
  setLoading(true)
  try{const data=await checked(await fetch('/api/image-studio/providers',{headers:{'x-workspace-account-id':account||''},cache:'no-store'}));setProviders(data.providers||[]);setError('')}
  catch(e){setError(e.message)}finally{setLoading(false)}
 }
 useEffect(()=>{void refresh();return()=>pending.current?.abort()},[])
 const selected=providers.find(p=>p.id===provider)
 const changeProvider=id=>{if(busy)return;const next=providers.find(p=>p.id===id);setProvider(id);setModel(next?.model||'');setError('');if(id==='google')setTransparent(false)}
 const upload=async event=>{const item=event.target.files?.[0];event.target.value='';if(!item)return;try{setReference(await imageFile(item));setError('')}catch(e){setError(e.message)}}
 const generate=async event=>{
  event.preventDefault()
  if(busy||!selected?.ready||!prompt.trim())return
  const controller=new AbortController();pending.current=controller;setBusy(true);setError('')
  try{
   const response=await fetch('/api/image-studio/generate',{
    method:'POST',headers:{'content-type':'application/json','x-workspace-account-id':account||''},signal:controller.signal,
    body:JSON.stringify({prompt:prompt.trim(),provider,model,aspect,transparent,image:reference})
   })
   const data=await checked(response)
   setResults(old=>[{...data,id:crypto.randomUUID(),prompt:prompt.trim()},...old].slice(0,3))
  }catch(e){if(e.name!=='AbortError')setError(e.message||'Image generation failed.')}
  finally{pending.current=null;setBusy(false)}
 }
 const download=item=>{
  const a=document.createElement('a');a.href=item.image
  const ext=/^data:image\/(png|jpeg|webp);/.exec(item.image)?.[1]||'png'
  a.download='workspace-ai-'+item.provider+'-'+item.id+'.'+(ext==='jpeg'?'jpg':ext);a.click()
 }
 const reuse=item=>{
  if(item.image.length>Math.ceil(4*1024*1024*4/3)+128){setError('This result is over the 4 MB edit limit; download it and upload a smaller copy.');return}
  setReference(item.image);setPrompt('Edit this image: ');window.scrollTo({top:0,behavior:'smooth'})
 }
 return <section className="workspacePage imageStudio" aria-labelledby="imageStudioTitle">
  <div className="workspacePageTop"><div><h1 id="imageStudioTitle"><WandSparkles size={26}/> Image Studio</h1><p>Create and edit visuals with a selected provider. Separate API charges may apply.</p></div><button type="button" className="outline" onClick={refresh} disabled={loading||busy}><RefreshCw size={16}/> Refresh</button></div>
  <div className="imageStudioLayout"><form className="imageStudioPanel" onSubmit={generate}>
   <fieldset disabled={busy}><legend>Image engine</legend><div className="imageStudioEngines">{providers.map(p=><button type="button" key={p.id} className={p.id===provider?'selected':''} aria-pressed={p.id===provider} onClick={()=>changeProvider(p.id)}><strong>{p.name}</strong><small>{p.ready?<><CheckCircle2 size={14}/> Configured</>:<><AlertCircle size={14}/> Setup needed</>}</small></button>)}</div>{loading&&<p role="status">Checking providers…</p>}{selected&&<p className="imageStudioNote">{selected.message}</p>}</fieldset>
   <label htmlFor="imageStudioModel">Model</label><select id="imageStudioModel" disabled={busy||!selected} value={model} onChange={e=>setModel(e.target.value)}>{(selected?.models||[]).map(m=><option value={m} key={m}>{m}</option>)}</select>
   <label htmlFor="imageStudioPrompt">Prompt</label><textarea id="imageStudioPrompt" value={prompt} onChange={e=>setPrompt(e.target.value)} required maxLength={4000} rows={5} placeholder="A minimalist architectural photograph at golden hour…" disabled={busy}/>
   <fieldset disabled={busy}><legend>Aspect ratio</legend><div className="imageStudioRatios">{RATIOS.map(([value,title])=><button type="button" key={value} aria-pressed={aspect===value} className={aspect===value?'selected':''} onClick={()=>setAspect(value)}>{title}<small>{value}</small></button>)}</div></fieldset>
   {provider==='openai'&&<label className="imageStudioToggle"><input type="checkbox" checked={transparent} onChange={e=>setTransparent(e.target.checked)} disabled={busy}/> Transparent PNG background</label>}
   <label>Reference image (optional)</label><input ref={file} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={upload} aria-label="Choose reference image"/>
   {reference?<div className="imageStudioReference"><img src={reference} alt="Reference input preview"/><button className="outline" type="button" disabled={busy} onClick={()=>setReference(null)}><Trash2 size={15}/> Remove</button></div>:<button type="button" className="outline" disabled={busy} onClick={()=>file.current?.click()}><ImagePlus size={17}/> Add PNG, JPEG or WebP · 4 MB max</button>}
   <div className="imageStudioActions"><button className="primary" type="submit" disabled={busy||!selected?.ready||!prompt.trim()}><WandSparkles size={17}/>{busy?'Creating…':'Generate image'}</button>{busy&&<button type="button" className="outline" onClick={()=>pending.current?.abort()}><Square size={15}/> Cancel</button>}</div>
   {selected&&!selected.ready&&<button type="button" className="outline" onClick={()=>onOpenSettings?.('connections')}>Connections settings</button>}
   {error&&<p role="alert" className="imageStudioError"><AlertCircle size={16}/>{error}</p>}
  </form><div className="imageStudioGallery">
   {!results.length?<div className="imageStudioEmpty"><Images size={42}/><h2>Start creating</h2><p>Your images appear here after you generate them. Download any result you want to keep.</p></div>:
   <><h2>Recent results</h2><div className="imageStudioResults">{results.map(item=><article key={item.id}><img src={item.image} alt={item.prompt}/><p><strong>{item.model}</strong> · {item.aspect}</p><p>{item.prompt}</p><div className="imageStudioActions"><button className="outline" type="button" onClick={()=>download(item)}><Download size={15}/> Download</button><button className="outline" type="button" disabled={busy} onClick={()=>reuse(item)}><RotateCcw size={15}/> Edit again</button></div></article>)}</div></>}
   <p className="imageStudioNote"><ShieldCheck size={16}/> Results remain in this view, not in browser storage. Inputs are sent only to the selected configured provider.</p>
  </div></div>
 </section>
}
