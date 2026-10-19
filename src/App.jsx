import React,{useEffect,useRef,useState} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {Sparkles,Plus,Menu,Settings2,Trash2,ArrowUp,Square,ChevronDown,Copy,ShieldCheck,CheckCircle,Download,X,AlertTriangle,KeyRound} from 'lucide-react';
const KEY='workspace-ai-history-v1';
const initial=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch{return []}};
function report(error){return error instanceof Error?error.message:String(error)}
async function api(url,data){const r=await fetch(url,data?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)}:{});const json=await r.json();if(!r.ok)throw Error(json.error||'Request failed');return json}
export default function App(){
const [chats,setChats]=useState(initial),[current,setCurrent]=useState(null),[draft,setDraft]=useState(''),[busy,setBusy]=useState(false),[settings,setSettings]=useState(false),[mobile,setMobile]=useState(false);
const [provider,setProvider]=useState('auto'),[fallback,setFallback]=useState(false),[planModel,setPlanModel]=useState(''),[models,setModels]=useState([]),[status,setStatus]=useState({connected:false,planEnabled:false,apiConfigured:false,model:''}),[error,setError]=useState('');
const bottom=useRef(null),controller=useRef(null),prompt=useRef(null);
const chat=chats.find(c=>c.id===current);
const ready=provider==='api'?status.apiConfigured:provider==='plan'?status.planEnabled&&!!planModel:(status.planEnabled&&!!planModel)||(status.apiConfigured&&fallback);
useEffect(()=>{try{localStorage.setItem(KEY,JSON.stringify(chats.slice(0,50)))}catch{}},[chats]);
useEffect(()=>{bottom.current?.scrollIntoView({behavior:'smooth'})},[chats,busy]);
async function refresh(){try{const s=await api('/api/status');setStatus(s);if(s.planEnabled){const m=await api('/api/models');setModels(m.planModels||[]);setPlanModel(old=>(m.planModels||[]).some(v=>v.slug===old)?old:(m.planModels?.[0]?.slug||''));if(m.error)setError(m.error)}}catch(e){setError(report(e))}}
useEffect(()=>{refresh();const auth=new URLSearchParams(location.search).get('auth');if(auth){history.replaceState({},'',location.pathname);setSettings(true);if(auth==='failed')setError('ChatGPT sign-in failed. Try again.')}},[]);
function newChat(){if(busy)return;setCurrent(null);setDraft('');setMobile(false);setError('');prompt.current?.focus()}
function remove(id){if(busy||!confirm('Delete this chat locally?'))return;setChats(v=>v.filter(c=>c.id!==id));if(current===id)setCurrent(null)}
function changeLast(id,fn){setChats(v=>v.map(c=>c.id!==id?c:{...c,messages:c.messages.map((m,i,a)=>i===a.length-1?fn(m):m)}))}
async function signIn(){try{const r=await api('/api/auth/start');if(new URL(r.url).origin!=='https://auth.openai.com')throw Error('Invalid OAuth authorization host');location.assign(r.url)}catch(e){setError(report(e))}}
async function signOut(){if(!confirm('Disconnect ChatGPT?'))return;try{const r=await api('/api/auth/disconnect',{});await refresh();if(r.warning)setError(r.warning)}catch(e){setError(report(e))}}
async function send(value=draft){
  const text=value.trim();
  if(!text||!ready||busy)return;
  const id=chat?.id||crypto.randomUUID();
  const history=[...(chat?.messages||[]).filter(m=>!m.error&&m.content?.trim()),{id:crypto.randomUUID(),role:'user',content:text}];
  const answer={id:crypto.randomUUID(),role:'assistant',content:''};
  setChats(v=>chat?v.map(c=>c.id===id?{...c,messages:[...history,answer],updatedAt:Date.now()}:c):[{id,title:text.slice(0,52),messages:[...history,answer],updatedAt:Date.now()},...v]);
  setCurrent(id);setDraft('');setError('');setBusy(true);
  const stop=new AbortController();controller.current=stop;
  try{
    const response=await fetch('/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
      messages:history.map(m=>({role:m.role,content:m.content})),preference:provider,model:planModel,allowApiFallback:fallback && status.apiConfigured
    }),signal:stop.signal});
    if(!response.ok){const e=await response.json().catch(()=>({}));throw Error(e.error||'Response failed')}
    if(!response.body)throw Error('The server returned no stream');
    const reader=response.body.getReader(),decoder=new TextDecoder();
    let buffer='',complete=false;
    const update=line=>{
      if(!line.trim())return;
      const e=JSON.parse(line);
      if(e.type==='meta')changeLast(id,m=>({...m,provider:e.provider,model:e.model}));
      if(e.type==='delta')changeLast(id,m=>({...m,content:m.content+(e.text||'')}));
      if(e.type==='complete')complete=true;
      if(e.type==='error')throw Error(e.message||'Streaming error');
    };
    try{
      while(true){
        const event=await reader.read();if(event.done)break;
        buffer+=decoder.decode(event.value,{stream:true});
        let i=buffer.indexOf('\n');
        while(i!==-1){update(buffer.slice(0,i));buffer=buffer.slice(i+1);i=buffer.indexOf('\n')}
      }
      if(buffer.trim())update(buffer);
    }finally{reader.releaseLock()}
    if(!complete)throw Error('Response ended unexpectedly');
  }catch(e){
    const message=stop.signal.aborted?'Generation stopped':report(e);
    changeLast(id,m=>({...m,error:true,content:m.content||message}));
    setError(message);
  }finally{setBusy(false);controller.current=null;prompt.current?.focus()}
}
function exportChat(){if(!chat)return;const md='# '+chat.title+'\n\n'+chat.messages.map(m=>'## '+m.role+'\n\n'+m.content).join('\n\n---\n\n');const url=URL.createObjectURL(new Blob([md],{type:'text/markdown'}));const a=document.createElement('a');a.href=url;a.download='workspace-ai-chat.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),0)}
return <div className="shell">
{mobile&&<button className="mobileShade" aria-label="Close navigation" onClick={()=>setMobile(false)}/>}
<aside className={'sidebar '+(mobile?'open':'')}>
 <button className="brand" onClick={newChat}><span className="brandIcon"><Sparkles size={19}/></span><strong>workspace<span>ai</span></strong></button>
 <button className="newChat" onClick={newChat}><Plus size={17}/>New conversation</button>
 <div className="history"><h4>YOUR WORKSPACE <span>{chats.length}</span></h4>
 {!chats.length&&<p>No conversations yet.</p>}
 {[...chats].sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0)).map(c=><div className={'historyRow '+(c.id===current?'selected':'')} key={c.id}>
 <button onClick={()=>{if(!busy){setCurrent(c.id);setMobile(false)}}}>{c.title||'Conversation'}</button>
 <button className="deleteChat" aria-label={'Delete '+c.title} onClick={()=>remove(c.id)}><Trash2 size={15}/></button></div>)}</div>
 <footer className="sideFoot"><div className="private"><ShieldCheck size={18}/><div><b>Private by design</b><small>History stored in this browser</small></div></div>
 <button className="settingsLink" onClick={()=>{setSettings(true);setMobile(false)}}><Settings2 size={17}/>Settings & connections</button><small className="sig">GOREECLOUD · WORKSPACE AI</small></footer>
</aside>
<main className="main">
 <header className="topbar"><div><button className="iconButton menu" onClick={()=>setMobile(true)} aria-label="Open navigation"><Menu size={19}/></button><strong>Workspace AI</strong><span className="beta">BETA</span></div>
 <div><span className="connected"><i className={status.planEnabled?'green':status.apiConfigured?'gold':''}></i>{status.planEnabled?'Plan connected':status.apiConfigured?'API ready':'Not connected'}</span><button className="iconButton" aria-label="Open settings" onClick={()=>setSettings(true)}><Settings2 size={19}/></button></div></header>
 <div className="viewport">{!chat?.messages?.length?<section className="welcome">
 <p className="eyebrow">✦ YOUR SPACE TO THINK BIGGER</p><div className="bigIcon"><Sparkles size={38}/></div>
 <h1>Good ideas start <em>here.</em></h1><p>Ask anything, create something, or follow your curiosity.<br/>Your AI workspace, your way.</p>
 <div className="ideas">{[['Explore an idea','Turn curiosity into clarity','Help me turn a new idea into a concrete project.'],['Write code','Build, debug and create','Help me plan and build a useful application.'],['Create content','Find the right words','Help me draft a clear and thoughtful article.'],['Learn something','Go beyond the surface','Explain an interesting concept with examples.']].map(([title,sub,idea],i)=><button key={title} className="idea" onClick={()=>{setDraft(idea);prompt.current?.focus()}}><span className={'ideaIcon icon'+i}>{i===0?<Sparkles size={19}/>:i===1?'⌘':i===2?'✎':'◇'}</span><span><strong>{title}</strong><small>{sub}</small></span><span className="ideaArrow">→</span></button>)}</div></section>:
 <section className="feed" aria-label="Conversation messages">{chat.messages.map(m=><article className={'message '+m.role} key={m.id}>
 {m.role==='assistant'&&<div className="avatar"><Sparkles size={16}/></div>}
 <div className="msgContent">{m.role==='assistant'&&<strong className="byline">Workspace AI <small>{m.provider==='plan'?'· ChatGPT plan':m.provider==='api'?'· OpenAI API':''}</small></strong>}
 {m.role==='user'?<div className="userBubble">{m.content}</div>:<div className={'markdown '+(m.error?'errorText':'')}>{m.content?<ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>:busy?'● ● ●':'No response received.'}</div>}
 {m.role==='assistant'&&!!m.content&&<button className="copy" onClick={()=>navigator.clipboard.writeText(m.content).catch(()=>setError('Could not copy text'))}><Copy size={14}/>Copy</button>}
 </div></article>)}<div ref={bottom}/></section>}</div>
 <div className="composerArea">{error&&<div className="notice error"><AlertTriangle size={16}/><span>{error}</span><button onClick={()=>setError('')} aria-label="Dismiss error"><X size={15}/></button></div>}
 {!ready&&<div className="notice"><span>Connect ChatGPT or configure a separately billed OpenAI API connection.</span><button onClick={()=>setSettings(true)}>Configure →</button></div>}
 <div className="composer"><textarea ref={prompt} value={draft} onChange={e=>setDraft(e.target.value)} maxLength={12000} rows={2} placeholder="Ask anything…" aria-label="Message to Workspace AI" onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}}/>
 <div className="composerBottom"><button className="sourceButton" onClick={()=>setSettings(true)}><Sparkles size={15}/>{provider==='auto'?'Automatic':provider==='api'?'OpenAI API':'ChatGPT plan'}<ChevronDown size={14}/></button><small>{provider==='plan'?planModel||'Choose a model':provider==='api'?status.model:'Smart routing'}</small>
 <button className="send" disabled={!busy&&(!ready||!draft.trim())} onClick={()=>busy?controller.current?.abort():send()} aria-label={busy?'Stop generation':'Send message'}>{busy?<Square size={16} fill="currentColor"/>:<ArrowUp size={19}/>}</button></div></div>
 <p className="disclaimer">Workspace AI can make mistakes. Verify important information. <span>POWERED BY OPENAI</span></p></div>
</main>
{settings&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setSettings(false)}}><section className="dialog" role="dialog" aria-modal="true" aria-label="Settings and connections">
<header className="modalHeader"><div><small>PREFERENCES</small><h2>Settings & connections</h2><p>Choose how your workspace connects.</p></div><button className="iconButton" onClick={()=>setSettings(false)} aria-label="Close settings"><X size={21}/></button></header>
<div className="dialogBody">
<h3>01 · CONNECTIONS</h3><div className="connectionCard"><div className="connectionTop"><span className="providerIcon"><Sparkles size={20}/></span><div><strong>ChatGPT subscription</strong><small>Eligible plan allowance with your permission</small></div><span className={'pill '+(status.planEnabled?'active':'')}>{status.planEnabled?'Connected':status.connected?'Sign-in only':'Not connected'}</span></div>
{status.connected&&<p className="connectedText"><CheckCircle size={16}/>{status.email||'ChatGPT account'}</p>}
<div className="actions">{status.connected?<><button className="outline" onClick={signIn}>Reauthorize</button><button className="danger" onClick={signOut}>Disconnect</button></>:<button className="primary" onClick={signIn}><Sparkles size={16}/>Continue with ChatGPT →</button>}</div></div>
<div className="connectionCard"><div className="connectionTop"><span className="providerIcon apiIcon"><KeyRound size={20}/></span><div><strong>OpenAI API</strong><small>Separately billed, optional fallback</small></div><span className={'pill '+(status.apiConfigured?'active':'')}>{status.apiConfigured?'Available':'Not configured'}</span></div><p className="helper">Add OPENAI_API_KEY to the private local .env file, then restart the server. Never place credentials in the browser.</p></div>
<h3>02 · ROUTING & MODEL</h3><label className="fieldLabel">Preferred provider</label><div className="segments">{[['auto','Automatic'],['plan','ChatGPT plan'],['api','OpenAI API']].map(([key,name])=><button key={key} aria-pressed={provider===key} className={provider===key?'selected':''} onClick={()=>setProvider(key)}>{name}</button>)}</div>
<p className="helper">Automatic uses the eligible ChatGPT plan first. Separate API billing requires explicit opt-in below.</p>
{provider!=='api'&&status.planEnabled&&<><label className="fieldLabel" htmlFor="modelPicker">ChatGPT plan model</label><select id="modelPicker" value={planModel} onChange={e=>setPlanModel(e.target.value)}>{models.length===0&&<option value="">No eligible models found</option>}{models.map(m=><option key={m.slug} value={m.slug}>{m.name}</option>)}</select></>}
{provider==='auto'&&<label className="toggle"><div><strong>Allow API fallback</strong><small>{status.apiConfigured ? 'May incur separate API charges if the ChatGPT plan cannot respond.' : 'Unavailable until an OpenAI API key is configured in the local server.'}</small></div><input type="checkbox" disabled={!status.apiConfigured} checked={Boolean(fallback && status.apiConfigured)} onChange={e=>setFallback(e.target.checked)}/></label>}
<h3>03 · DATA & PRIVACY</h3><p className="privacyInfo">Chat history is saved in browser local storage. OAuth credentials remain outside the repository in a protected local file. Requests use store: false.</p>
<div className="actions"><button className="outline" disabled={!chat} onClick={exportChat}><Download size={15}/>Export conversation</button><button className="outline" onClick={refresh}>Refresh status</button></div></div>
<footer className="dialogFooter"><small>LOCAL FIRST · PUBLIC SOURCE</small><button className="primary" onClick={()=>setSettings(false)}>Done</button></footer>
</section></div>}
</div>
}
