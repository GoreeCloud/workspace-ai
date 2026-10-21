import React,{useEffect,useRef,useState} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ConnectionField from './ConnectionField.jsx';
import WorkspaceNavigation from './WorkspaceNavigation.jsx';
import WorkspaceViews from './WorkspaceViews.jsx';
import WorkspaceBackup from './WorkspaceBackup.jsx';
import {prepareWorkspaceRestore,persistWorkspaceRestore} from './workspace-backup.js';
import {readWorkspace,WORKSPACE_KEY} from './workspace-state.js';
import {persistWorkspaceChange} from './workspace-persistence.js';
import {BrowserStorageConflict,createBrowserStorageGuard,browserStorageLoadProblem} from './browser-storage-guard.js';
import {moveChatToProject,scopedChatMessages,conversationContextStart} from './chat-project-boundary.js';
import {projectContext,inferenceMessages} from './project-model.js';
import {memoryCandidateFromMessage} from './project-memory.js';
import {normalizeProjectMemoryEntries,createProjectMemoryEntry} from './project-memory-entries.js';
import {appendPromptDraft,promptsForContext} from './prompt-library.js';
import {Sparkles,Plus,Menu,Settings2,Trash2,ArrowUp,Square,ChevronDown,Copy,ShieldCheck,CheckCircle,Download,X,AlertTriangle,KeyRound} from 'lucide-react';
const KEY='workspace-ai-history-v1';
const initial=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch{return []}};
function report(error){return error instanceof Error?error.message:String(error)}
async function api(url,data){const r=await fetch(url,data?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)}:{});const json=await r.json();if(!r.ok)throw Error(json.error||'Request failed');return json}
export default function App(){
const [chats,setChats]=useState(initial),[current,setCurrent]=useState(null),[draft,setDraft]=useState(''),[busy,setBusy]=useState(false),[settings,setSettings]=useState(false),[mobile,setMobile]=useState(false);
const [provider,setProvider]=useState('auto'),[fallback,setFallback]=useState(false),[planModel,setPlanModel]=useState(''),[models,setModels]=useState([]),[status,setStatus]=useState({connected:false,planEnabled:false,apiConfigured:false,model:''}),[error,setError]=useState('');
const [settingsTab,setSettingsTab]=useState('connections');
const [memoryDraft,setMemoryDraft]=useState(null);
const [storageConflict,setStorageConflict]=useState(()=>browserStorageLoadProblem(localStorage,KEY,WORKSPACE_KEY));
const [workspace,setWorkspace]=useState(readWorkspace),[view,setView]=useState('chat'),[selectedProject,setSelectedProject]=useState(null),[searchRequest,setSearchRequest]=useState(0);
const [appearance,setAppearance]=useState(()=>{try{const saved=localStorage.getItem('workspace-ai-theme');return ['light','dark','system'].includes(saved)?saved:'system'}catch{return 'system'}});
const bottom=useRef(null),controller=useRef(null),prompt=useRef(null);
const workspaceRef=useRef(workspace);
workspaceRef.current=workspace;
const chatsRef=useRef(chats);
chatsRef.current=chats;
const storageGuard=useRef(null);
if(!storageGuard.current)storageGuard.current=createBrowserStorageGuard(localStorage,[KEY,WORKSPACE_KEY]);
const dialogRef=useRef(null);
const chat=chats.find(c=>c.id===current);
const activeProjectId=chat?.projectId||(!chat?selectedProject:null);
const activeProject=workspace.projects.find(p=>p.id===activeProjectId);
const ready=provider==='api'?status.apiConfigured:provider==='plan'?status.planEnabled&&!!planModel:(status.planEnabled&&!!planModel)||(status.apiConfigured&&fallback);
function handleStorageFailure(error){
 if(error instanceof BrowserStorageConflict){
  setStorageConflict(error.message);
  controller.current?.abort();
  setError(error.message);
 }else setError('Conversation or project changes could not be saved in browser storage: '+report(error)+'. Export a backup and free space.');
}
function commitChats(change) {
 if(storageConflict){setError(storageConflict);return false}
 try {
  const next=typeof change==='function'?change(chatsRef.current):change;
  if(!Array.isArray(next)||next.length>50)throw Error('Workspace AI stores at most 50 conversations. Delete an old chat before continuing.');
  storageGuard.current.write(KEY,JSON.stringify(next));
  chatsRef.current=next;
  setChats(next);
  return true;
 }catch(error){handleStorageFailure(error);return false}
}
useEffect(()=>{
 if(storageConflict)return;
 try{storageGuard.current.write(KEY,JSON.stringify(chats.slice(0,50)));}
 catch(error){handleStorageFailure(error)}
},[chats,storageConflict]);
useEffect(()=>{
 const onStorage=event=>{
  if(event.storageArea!==localStorage)return;
  try{
   if(storageGuard.current.watch(event.key)){
    handleStorageFailure(new BrowserStorageConflict());
   }
  }catch(error){handleStorageFailure(error)}
 };
 window.addEventListener('storage',onStorage);
 return ()=>window.removeEventListener('storage',onStorage);
},[]);
function updateWorkspace(change){
 if(storageConflict){setError(storageConflict);return false}
 try{
  const next=persistWorkspaceChange({setItem:(key,value)=>storageGuard.current.write(key,value)},WORKSPACE_KEY,workspaceRef.current,change);
  workspaceRef.current=next;
  setWorkspace(next);
  return true;
 }catch(error){handleStorageFailure(error);return false}
}
useEffect(()=>{bottom.current?.scrollIntoView({behavior:'smooth'})},[chats,busy]);
useEffect(()=>{
 const system=window.matchMedia('(prefers-color-scheme: dark)');
 const update=()=>document.documentElement.setAttribute('data-mode',appearance==='system'?(system.matches?'dark':'light'):appearance);
 document.documentElement.setAttribute('data-accent','iris');
 update();
 system.addEventListener('change',update);
 try{localStorage.setItem('workspace-ai-theme',appearance)}catch{}
 return ()=>system.removeEventListener('change',update);
},[appearance]);
useEffect(()=>{
 if(!settings)return;
 const previous=document.activeElement;
 const modal=dialogRef.current;
 const focusable=()=>Array.from(modal?.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]')||[]).filter(node=>node.getClientRects().length);
 modal?.querySelector('button')?.focus();
 const onKey=(event)=>{
   if(event.key==='Escape'){event.preventDefault();setSettings(false);return}
   if(event.key!=='Tab')return;
   const nodes=focusable();if(!nodes.length)return;
   const first=nodes[0],last=nodes[nodes.length-1];
   if(event.shiftKey && document.activeElement===first){event.preventDefault();last.focus()}
   else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus()}
 };
 document.addEventListener('keydown',onKey);
 return ()=>{document.removeEventListener('keydown',onKey);if(previous instanceof HTMLElement)previous.focus()};
},[settings]);
useEffect(()=>{
 const onKey=event=>{
  if(event.defaultPrevented||event.isComposing||settings||event.altKey||(!event.metaKey&&!event.ctrlKey))return;
  if(!event.shiftKey&&event.key.toLowerCase()==='k'){
   event.preventDefault();setView('chats');setMobile(false);setSearchRequest(n=>n+1);
  }else if(event.shiftKey&&event.key.toLowerCase()==='n'){
   event.preventDefault();newChat();
  }
 };
 document.addEventListener('keydown',onKey);
 return ()=>document.removeEventListener('keydown',onKey);
},[settings,busy]);
async function refresh(){try{const s=await api('/api/status');setStatus(s);if(s.planEnabled){const m=await api('/api/models');setModels(m.planModels||[]);setPlanModel(old=>(m.planModels||[]).some(v=>v.slug===old)?old:(m.planModels?.[0]?.slug||''));if(m.error)setError(m.error)}}catch(e){setError(report(e))}}
useEffect(()=>{refresh();const auth=new URLSearchParams(location.search).get('auth');if(auth){history.replaceState({},'',location.pathname);setSettings(true);if(auth==='failed')setError('ChatGPT sign-in failed. Try again.')}},[]);
function newChat(projectId){if(busy||storageConflict)return;setCurrent(null);setMemoryDraft(null);setView('chat');setSelectedProject(typeof projectId==='string'?projectId:null);setDraft('');setMobile(false);setError('');prompt.current?.focus()}
function remove(id){if(busy||storageConflict||!confirm('Delete this chat locally?'))return;if(!commitChats(v=>v.filter(c=>c.id!==id)))return;updateWorkspace(w=>({...w,pinned:w.pinned.filter(v=>v!==id)}));if(current===id)setCurrent(null)}
function openChat(id){if(busy)return;setCurrent(id);setMemoryDraft(null);setView('chat');setMobile(false);setSelectedProject(chats.find(c=>c.id===id)?.projectId||null)}
function assignChat(id,projectId){if(busy||storageConflict)return;const safeId=workspaceRef.current.projects.some(p=>p.id===projectId)?projectId:null;if(!commitChats(v=>v.map(c=>c.id===id?moveChatToProject(c,safeId):c)))return;if(current===id){setSelectedProject(safeId);setMemoryDraft(null)}}
function renameChat(id,title){if(storageConflict)return;const clean=title.trim().slice(0,90);if(clean)commitChats(v=>v.map(c=>c.id===id?{...c,title:clean,updatedAt:Date.now()}:c))}
function useSavedPrompt(item){
 if(busy||!item||(workspace.prompts||[]).every(p=>p.id!==item.id))return
 if(item.projectId&&!workspace.projects.some(p=>p.id===item.projectId))return
 try{
  if(view==='chat'&&(!item.projectId||item.projectId===activeProjectId))setDraft(old=>appendPromptDraft(old,item.content))
  else{setCurrent(null);setSelectedProject(item.projectId||null);setDraft(item.content)}
  setView('chat');setMobile(false);setError('');prompt.current?.focus()
 }catch(e){setError(report(e))}
}
function navigate(id){setView(id);setMobile(false)}
function changeLast(id,fn){setChats(v=>v.map(c=>c.id!==id?c:{...c,messages:c.messages.map((m,i,a)=>i===a.length-1?fn(m):m)}))}
async function signIn(){try{const r=await api('/api/auth/start');if(new URL(r.url).origin!=='https://auth.openai.com')throw Error('Invalid OAuth authorization host');location.assign(r.url)}catch(e){setError(report(e))}}
async function signOut(){if(!confirm('Disconnect ChatGPT?'))return;try{const r=await api('/api/auth/disconnect',{});await refresh();if(r.warning)setError(r.warning)}catch(e){setError(report(e))}}
async function send(value=draft){
  const text=value.trim();
  if(!text||!ready||busy||storageConflict)return;
  if(!chat&&chatsRef.current.length>=50){setError('Workspace AI stores at most 50 conversations. Delete an old chat before starting another.');return}
  const id=chat?.id||crypto.randomUUID();
  const context=projectContext(workspace,activeProjectId,text);
  const message={id:crypto.randomUUID(),role:'user',content:text};
  const history=[...(chat?.messages||[]),message]; // Keep older messages visible.
  const requestHistory=[...scopedChatMessages(chat),message]; // Send only the current project segment.
  const answer={id:crypto.randomUUID(),role:'assistant',content:''};
  if(!commitChats(v=>chat?v.map(c=>c.id===id?{...c,messages:[...history,answer],updatedAt:Date.now()}:c):[{id,title:text.slice(0,52),messages:[...history,answer],projectId:activeProjectId||null,updatedAt:Date.now()},...v]))return;
  setCurrent(id);setDraft('');setError('');setBusy(true);
  const stop=new AbortController();controller.current=stop;
  try{
    const response=await fetch('/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
      messages:inferenceMessages(requestHistory,context),preference:provider,model:planModel,allowApiFallback:fallback && status.apiConfigured
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
function saveReviewedMemory(){
 if(!memoryDraft||busy||!activeProject?.memoryEnabled||!chat||memoryDraft.projectId!==activeProject.id||memoryDraft.chatId!==chat.id)return;
 try{
  const entries=normalizeProjectMemoryEntries(activeProject.memoryEntries)
  if(entries.some(entry=>entry.content===memoryDraft.text.trim()))throw Error('This reviewed memory is already saved.')
  const nextEntry=createProjectMemoryEntry('From chat: '+chat.title.slice(0,76),memoryDraft.text,crypto.randomUUID())
  const nextEntries=normalizeProjectMemoryEntries([...entries,nextEntry])
  if(updateWorkspace(w=>({...w,projects:w.projects.map(p=>p.id===activeProject.id?{...p,memoryEntries:nextEntries}:p)}))){
   setMemoryDraft(null);
   setError('');
  }
 }catch(e){setError(report(e))}
}
function restoreWorkspace(archive,mode){
 if(busy||storageConflict)throw Error('Stop generation or reload the tab before restoring conversations');
 const restored=prepareWorkspaceRestore(chats,workspace,archive,mode);
 storageGuard.current.restore(()=>persistWorkspaceRestore(localStorage,KEY,WORKSPACE_KEY,restored));
 chatsRef.current=restored.chats;setChats(restored.chats);workspaceRef.current=restored.workspace;setWorkspace(restored.workspace);setCurrent(null);setMemoryDraft(null);setSelectedProject(null);setView('chats');
 return restored;
}
function exportChat(){if(!chat)return;const md='# '+chat.title+'\n\n'+chat.messages.map(m=>'## '+m.role+'\n\n'+m.content).join('\n\n---\n\n');const url=URL.createObjectURL(new Blob([md],{type:'text/markdown'}));const a=document.createElement('a');a.href=url;a.download='workspace-ai-chat.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),0)}
return <div className={"shell workspaceShell"+(workspace.collapsed?" isCollapsed":"")}>
<WorkspaceNavigation workspace={workspace} onWorkspace={updateWorkspace} view={view} onNavigate={navigate}
 chats={chats} current={current} onSelectChat={openChat} onNewChat={()=>newChat()}
 mobile={mobile} onMobile={setMobile} selectedProject={selectedProject} onProject={setSelectedProject} onUsePrompt={useSavedPrompt}/>
<main className="main">
 {storageConflict&&<div className="notice error" role="alert"><AlertTriangle size={16}/><span>{storageConflict}</span><button type="button" onClick={()=>window.location.reload()}>Reload latest</button></div>}
 <header className="topbar"><div><button className="iconButton menu" onClick={()=>setMobile(true)} aria-label="Open navigation"><Menu size={19}/></button><strong>{view==='chat'?'Workspace AI':{mcp:'MCP',api:'API',projects:'Projects',prompts:'Prompts',pinned:'Pinned',chats:'All Chats',settings:'Settings'}[view]}</strong><span className="beta">BETA</span></div>
 <div><span className="connected"><i className={status.planEnabled?'green':status.apiConfigured?'gold':''}></i>{status.planEnabled?'Plan connected':status.apiConfigured?'API ready':'Not connected'}</span><button className="iconButton" aria-label="Open settings" onClick={()=>setSettings(true)}><Settings2 size={19}/></button></div></header>
 {error&&view!=='chat'&&<div className="notice error" role="alert"><AlertTriangle size={16}/><span>{error}</span><button onClick={()=>setError('')} aria-label="Dismiss error"><X size={15}/></button></div>}
 <div className="viewport">{view!=='chat'?<WorkspaceViews view={view} chats={chats} workspace={workspace} onWorkspace={updateWorkspace}
 onSelectChat={openChat} onNewChat={newChat} onDeleteChat={remove} onAssignChat={assignChat} onRenameChat={renameChat}
 selectedProject={selectedProject} onProject={setSelectedProject} focusSearchRequest={searchRequest} busy={busy||storageConflict} onUsePrompt={useSavedPrompt} onOpenSettings={()=>{setSettingsTab('connections');setSettings(true)}}/>:!chat?.messages?.length?<section className="welcome">
 <p className="eyebrow">✦ YOUR SPACE TO THINK BIGGER</p><div className="bigIcon"><Sparkles size={38}/></div>
 <h1>Good ideas start <em>here.</em></h1><p>Ask anything, create something, or follow your curiosity.<br/>Your AI workspace, your way.</p>
 <div className="ideas">{[['Explore an idea','Turn curiosity into clarity','Help me turn a new idea into a concrete project.'],['Write code','Build, debug and create','Help me plan and build a useful application.'],['Create content','Find the right words','Help me draft a clear and thoughtful article.'],['Learn something','Go beyond the surface','Explain an interesting concept with examples.']].map(([title,sub,idea],i)=><button key={title} className="idea" onClick={()=>{setDraft(idea);prompt.current?.focus()}}><span className={'ideaIcon icon'+i}>{i===0?<Sparkles size={19}/>:i===1?'⌘':i===2?'✎':'◇'}</span><span><strong>{title}</strong><small>{sub}</small></span><span className="ideaArrow">→</span></button>)}</div></section>:
 <section className="feed" aria-label="Conversation messages">{chat.messages.map((m,messageIndex)=><article className={'message '+m.role} key={m.id}>
 {m.role==='assistant'&&<div className="avatar"><Sparkles size={16}/></div>}
 <div className="msgContent">{m.role==='assistant'&&<strong className="byline">Workspace AI <small>{m.provider==='plan'?'· ChatGPT plan':m.provider==='api'?'· OpenAI API':''}</small></strong>}
 {m.role==='user'?<div className="userBubble">{m.content}</div>:<div className={'markdown '+(m.error?'errorText':'')}>{m.content?<ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>:busy?'● ● ●':'No response received.'}</div>}
 {m.role==='assistant'&&!!m.content&&<div className="messageTools"><button className="copy" onClick={()=>navigator.clipboard.writeText(m.content).catch(()=>setError('Could not copy text'))}><Copy size={14}/>Copy</button>
 {activeProject?.memoryEnabled&&!m.error&&messageIndex>=conversationContextStart(chat)&&<button className="copy" disabled={busy} onClick={()=>setMemoryDraft({projectId:activeProject.id,chatId:chat.id,messageId:m.id,text:memoryCandidateFromMessage(m.content)})}><Sparkles size={14}/>Review for project memory</button>}</div>}
 {memoryDraft?.chatId===chat.id&&memoryDraft?.messageId===m.id&&memoryDraft?.projectId===activeProject?.id&&<div className="memoryReview">
 <label htmlFor={'review-'+m.id}>Review and edit the memory saved to {activeProject.name}</label>
 <textarea id={'review-'+m.id} rows={4} maxLength={1200} value={memoryDraft.text} onChange={e=>setMemoryDraft(v=>({...v,text:e.target.value}))}/>
 <p>This text is not saved until you approve it. Saved notes are private to this project and never shared with other projects.</p>
 <div className="actions"><button className="primary" onClick={saveReviewedMemory} disabled={!memoryDraft.text.trim()||busy}>Save reviewed memory</button>
 <button className="outline" onClick={()=>setMemoryDraft(null)}>Cancel</button></div></div>}
 </div></article>)}<div ref={bottom}/></section>}</div>
 {view==='chat'&&<div className="composerArea">{chat&&conversationContextStart(chat)>0&&<p className="disclaimer" role="status">This chat was moved between projects. Older messages remain visible, but the AI does not receive them in new requests.</p>}{activeProject&&<div className="workspaceScope">Project: {activeProject.name} · {activeProject.files?.length||0} files · Project instructions active {chat?<button title="Move chat to no project" aria-label="Move chat out of project" disabled={busy} onClick={()=>assignChat(chat.id,null)}>Remove from project</button>:<button title="New chat outside project" aria-label="Start a chat outside this project" onClick={()=>setSelectedProject(null)}>×</button>}</div>}{error&&<div className="notice error"><AlertTriangle size={16}/><span>{error}</span><button onClick={()=>setError('')} aria-label="Dismiss error"><X size={15}/></button></div>}
 {!ready&&<div className="notice"><span>Connect ChatGPT or configure a separately billed OpenAI API connection.</span><button onClick={()=>{setSettingsTab('connections');setSettings(true)}}>Configure →</button></div>}
 <div className="composer"><textarea ref={prompt} value={draft} onChange={e=>setDraft(e.target.value)} maxLength={12000} rows={2} placeholder="Ask anything…" aria-label="Message to Workspace AI" onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}}/>
 <div className="composerBottom"><select aria-label="Insert saved prompt" className="promptComposerSelect" defaultValue="" disabled={busy} onChange={e=>{const p=(workspace.prompts||[]).find(p=>p.id===e.target.value);if(p){try{setDraft(old=>appendPromptDraft(old,p.content))}catch(err){setError(report(err))}}e.target.value='';prompt.current?.focus()}}><option value="">Saved prompts…</option>{promptsForContext(workspace.prompts||[],activeProjectId).map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select><button className="sourceButton" onClick={()=>{setSettingsTab('routing');setSettings(true)}}><Sparkles size={15}/>{provider==='auto'?'Automatic':provider==='api'?'OpenAI API':'ChatGPT plan'}<ChevronDown size={14}/></button><small>{provider==='plan'?planModel||'Choose a model':provider==='api'?status.model:'Smart routing'}</small>
 <button className="send" disabled={!busy&&(!ready||!draft.trim()||storageConflict)} onClick={()=>busy?controller.current?.abort():send()} aria-label={busy?'Stop generation':'Send message'}>{busy?<Square size={16} fill="currentColor"/>:<ArrowUp size={19}/>}</button></div></div>
 <p className="disclaimer">Workspace AI can make mistakes. Verify important information. <span>POWERED BY OPENAI</span></p></div>}
</main>
{settings&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setSettings(false)}}><section ref={dialogRef} className="dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title" aria-describedby="settings-description">
<header className="modalHeader"><div><small>PREFERENCES</small><h2 id="settings-title">Settings & connections</h2><p id="settings-description">Customize your workspace and manage your AI connections.</p></div><button className="iconButton" onClick={()=>setSettings(false)} aria-label="Close settings"><X size={21}/></button></header>
<nav className="settingsTabs" aria-label="Settings sections">
 {[
 ['connections','Connections'],['routing','Models & billing'],['appearance','Appearance'],['privacy','Privacy']
 ].map(([key,label])=><button key={key} type="button" aria-current={settingsTab===key?'page':undefined}
 className={settingsTab===key?'active':''} onClick={()=>setSettingsTab(key)}>{label}</button>)}
</nav>
<div className="dialogBody">
<section className="settingsPanel" hidden={settingsTab!=='connections'}>
<h3>01 · CONNECTIONS</h3><div className="connectionCard"><div className="connectionTop"><span className="providerIcon"><Sparkles size={20}/></span><div><strong>ChatGPT subscription</strong><small>Eligible plan allowance with your permission</small></div><span className={'pill '+(status.planEnabled?'active':'')}>{status.planEnabled?'Connected':status.connected?'Sign-in only':'Not connected'}</span></div>
{status.connected&&<p className="connectedText"><CheckCircle size={16}/>{status.email||'ChatGPT account'}</p>}
<div className="actions">{status.connected?<><button className="outline" onClick={signIn}>Reauthorize</button><button className="danger" onClick={signOut}>Disconnect</button></>:<button className="primary" onClick={signIn}><Sparkles size={16}/>Continue with ChatGPT →</button>}</div></div>
<div className="connectionCard"><div className="connectionTop"><span className="providerIcon apiIcon"><KeyRound size={20}/></span><div><strong>OpenAI API</strong><small>Separately billed, optional fallback</small></div><span className={'pill '+(status.apiConfigured?'active':'')}>{!status.apiConfigured?'Not configured':status.apiVerification?.state==='verified'?'Key verified':status.apiVerification?.state==='invalid'?'Key rejected':status.apiVerification?.state==='restricted'?'Restricted':'Configured'}</span></div><ConnectionField configured={status.apiConfigured} keySource={status.apiKeySource} verification={status.apiVerification} onRefresh={refresh}/></div>
</section>
<section className="settingsPanel" hidden={settingsTab!=='routing'}>
<h3>02 · ROUTING & MODEL</h3><label className="fieldLabel">Preferred provider</label><div className="segments">{[['auto','Automatic'],['plan','ChatGPT plan'],['api','OpenAI API']].map(([key,name])=><button key={key} aria-pressed={provider===key} className={provider===key?'selected':''} onClick={()=>setProvider(key)}>{name}</button>)}</div>
<p className="helper">Automatic uses the eligible ChatGPT plan first. Separate API billing requires explicit opt-in below.</p>
{provider!=='api'&&status.planEnabled&&<><label className="fieldLabel" htmlFor="modelPicker">ChatGPT plan model</label><select id="modelPicker" value={planModel} onChange={e=>setPlanModel(e.target.value)}>{models.length===0&&<option value="">No eligible models found</option>}{models.map(m=><option key={m.slug} value={m.slug}>{m.name}</option>)}</select></>}
{provider==='auto'&&<label className="toggle"><div><strong>Allow API fallback</strong><small>{status.apiConfigured ? 'May incur separate API charges if the ChatGPT plan cannot respond.' : 'Unavailable until an OpenAI API key is configured in the local server.'}</small></div><input type="checkbox" disabled={!status.apiConfigured} checked={Boolean(fallback && status.apiConfigured)} onChange={e=>setFallback(e.target.checked)}/></label>}
</section>
<section className="settingsPanel" hidden={settingsTab!=='appearance'}>
<h3>03 · APPEARANCE</h3>
<div className="settings-theme-group">
 <div className="settings-preview-row">
  <span className="theme-label">Color theme</span>
  <div className="segments theme-segments" role="group" aria-label="Appearance">
   {['system','light','dark'].map(value=><button key={value} aria-pressed={appearance===value} className={appearance===value?'selected':''} onClick={()=>setAppearance(value)}>{value==='system'?'System':value==='light'?'Light':'Dark'}</button>)}
  </div>
 </div>
 <p>Follows your device by default. Your preference is saved on this browser.</p>
</div>
</section>
<section className="settingsPanel" hidden={settingsTab!=='privacy'}>
<h3>04 · DATA & PRIVACY</h3><p className="privacyInfo">Chat history is saved in browser local storage. OAuth credentials remain outside the repository in a protected local file. Requests use store: false.</p>
<WorkspaceBackup chats={chats} workspace={workspace} onRestore={restoreWorkspace} busy={busy||storageConflict}/><div className="actions"><button className="outline" disabled={!chat} onClick={exportChat}><Download size={15}/>Export conversation</button><button className="outline" onClick={refresh}>Refresh status</button></div>
</section></div>
<footer className="dialogFooter"><small>LOCAL FIRST · PUBLIC SOURCE</small><button className="primary" onClick={()=>setSettings(false)}>Done</button></footer>
</section></div>}
</div>
}
