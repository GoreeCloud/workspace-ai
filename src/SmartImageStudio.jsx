import React,{useEffect,useMemo,useState} from 'react'
import {Sparkles,Image,KeyRound,Trash2,ShieldCheck} from 'lucide-react'
import {IMAGE_MODEL_CHOICES,IMAGE_RATIOS,IMAGE_PRIORITIES,chooseImageModel} from './smart-image-policy.js'
import './smart-image-studio.css'
async function request(path,method='GET',body){
 const res=await fetch('/api/smart-images/'+path,{method,headers:body?{'content-type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})})
 const value=await res.json();if(!res.ok)throw Error(value.error||'Image request failed');return value
}
export default function SmartImageStudio(){
 const [configured,setConfigured]=useState(null),[apiKey,setApiKey]=useState('')
 const [prompt,setPrompt]=useState(''),[model,setModel]=useState('auto')
 const [priority,setPriority]=useState('balanced'),[aspectRatio,setAspectRatio]=useState('1:1')
 const [numImages,setNumImages]=useState(1),[busy,setBusy]=useState(false)
 const [error,setError]=useState(''),[notice,setNotice]=useState('')
 const [quote,setQuote]=useState(null),[result,setResult]=useState(null)
 useEffect(()=>{let active=true;request('status').then(s=>{if(active)setConfigured(s)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[])
 const route=useMemo(()=>{try{return chooseImageModel({prompt,model,priority})}catch{return null}},[prompt,model,priority])
 const change=fn=>{fn();setQuote(null);setResult(null);setNotice('');setError('')}
 async function saveKey(e){
  e.preventDefault();setBusy(true);setError('')
  try{setConfigured(await request('credential','POST',{key:apiKey}));setApiKey('');setNotice('Provider key held in local server memory.')}
  catch(e){setError(e.message)}finally{setBusy(false)}
 }
 async function clearKey(){
  setBusy(true);setError('')
  try{setConfigured(await request('credential','DELETE'));setResult(null);setQuote(null);setNotice('Session key cleared.')}
  catch(e){setError(e.message)}finally{setBusy(false)}
 }
 async function execute(endpoint){
  if(!route||!configured?.configured||busy)return
  setBusy(true);setError('');setNotice('')
  try{
   const data=await request(endpoint,'POST',{prompt,model,priority,aspectRatio,numImages})
   if(endpoint==='quote'){setQuote(data);setNotice('Price quote returned without generating an image.')}
   else{setResult(data);setQuote(null);setNotice('Generation finished. Save images before provider URLs expire.')}
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 return <main className="workspacePage smartImagePage">
  <div className="workspacePageTop"><div><h1>Smart Image Generation</h1>
   <p>Choose the best-fit generator automatically, or lock one specific model.</p></div><span className="smartImageLabel"><Sparkles size={15}/> Ideogram REST</span></div>
  <section className="smartImagePanel">
   <h2><KeyRound size={18}/> Provider connection</h2>
   <p>One Ideogram API key can access Ideogram 4.5, GPT Image 2.5 and Nano Banana 2.1. Generation is separately billed.</p>
   <form className="smartImageActions" onSubmit={saveKey}>
    <label>Session API key<input type="password" autoComplete="off" value={apiKey} onChange={e=>setApiKey(e.target.value)}
      spellCheck={false} maxLength={512} placeholder="Ideogram API key"/></label>
    <button className="primary" disabled={busy||apiKey.length<20}>Use key</button>
    {configured?.source==='session'&&<button className="outline" type="button" disabled={busy} onClick={clearKey}><Trash2 size={15}/> Clear key</button>}
   </form>
   <small>{configured?.configured?'Provider configured':'Provider not configured'} · Keys remain in server memory, not browser storage.</small>
  </section>
  <section className="smartImagePanel">
   <h2><Image size={18}/> Image request</h2>
   <label>Describe the image<textarea rows={5} value={prompt} maxLength={10000}
    onChange={e=>change(()=>setPrompt(e.target.value))} placeholder="Describe the image you want to generate…"/></label>
   <div className="smartImageOptions">
    <label>Generator<select value={model} onChange={e=>change(()=>setModel(e.target.value))}>
     {IMAGE_MODEL_CHOICES.map(m=><option value={m.id} key={m.id}>{m.label}</option>)}</select></label>
    <label>Priority<select value={priority} onChange={e=>change(()=>setPriority(e.target.value))}>
     {IMAGE_PRIORITIES.map(p=><option key={p}>{p}</option>)}</select></label>
    <label>Aspect ratio<select value={aspectRatio} onChange={e=>change(()=>setAspectRatio(e.target.value))}>
     {IMAGE_RATIOS.map(r=><option key={r}>{r}</option>)}</select></label>
    <label>Count<select value={numImages} onChange={e=>change(()=>setNumImages(Number(e.target.value)))}>
     {[1,2,3,4].map(n=><option key={n}>{n}</option>)}</select></label>
   </div>
   {route&&<p className="smartImageRoute" role="status"><Sparkles size={16}/>
    {IMAGE_MODEL_CHOICES.find(m=>m.id===route.selected)?.label}: {route.reason}</p>}
   <div className="smartImageActions">
    <button className="outline" type="button" onClick={()=>execute('quote')} disabled={busy||!route||!configured?.configured}>
     Check price (free dry run)</button>
    <button className="primary" type="button" onClick={()=>execute('generate')} disabled={busy||!route||!configured?.configured}>
     {busy?'Working…':'Generate image'}</button>
   </div><small>Generating may incur provider charges. Smart mode selects one generator per request.</small>
  </section>
  {error&&<p role="alert" className="notice error">{error}</p>}
  {notice&&<p role="status" className="smartImageRoute">{notice}</p>}
  {quote&&<section className="smartImagePanel"><h2>Provider quote</h2>
   <pre className="smartImageQuote">{JSON.stringify(quote.quote,null,2)}</pre></section>}
  {result&&<section className="smartImagePanel"><h2>Generated images · {result.providerModel}</h2>
   <div className="smartImageGallery">{result.images?.map((item,i)=><figure key={item.url}>
    <img src={item.url} alt={'Generated image '+(i+1)+': '+prompt.slice(0,100)}
      referrerPolicy="no-referrer" loading="lazy"/>
    <figcaption>{item.resolution||'Image '+(i+1)} · <a href={item.url} target="_blank"
     rel="noopener noreferrer">Open or save</a></figcaption></figure>)}</div>
   <p>Provider links expire. Save images before leaving the workspace.</p></section>}
  <p className="smartImageFooter"><ShieldCheck size={16}/> Direct generation only.
   Agent-driven image tools require independent approval and a separate MCP bridge.</p>
 </main>
}
