import React,{useState} from 'react'
import {Plus,Search,BookOpen,PenLine,Trash2,ArrowUpRight,Check,X} from 'lucide-react'
import {PROMPT_MAX_COUNT,PROMPT_TITLE_MAX,PROMPT_CONTENT_MAX,normalizePrompts} from './prompt-library.js'

export default function PromptsView({workspace,onWorkspace,onUsePrompt,defaultProjectId=null,busy=false}){
 const [query,setQuery]=useState('')
 const [editing,setEditing]=useState(null)
 const [title,setTitle]=useState('')
 const [content,setContent]=useState('')
 const [scope,setScope]=useState(defaultProjectId||'')
 const [error,setError]=useState('')
 const projects=workspace.projects||[],prompts=workspace.prompts||[]
 const matches=prompts.filter(p=>[p.title,p.content,projects.find(x=>x.id===p.projectId)?.name||'All chats'].some(t=>t.toLowerCase().includes(query.trim().toLowerCase()))).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0))
 const start=(p=null)=>{setEditing(p?.id||'new');setTitle(p?.title||'');setContent(p?.content||'');setScope(p?.projectId||(!p&&projects.some(x=>x.id===defaultProjectId)?defaultProjectId:''));setError('')}
 const cancel=()=>{setEditing(null);setError('')}
 const save=e=>{
  e.preventDefault()
  const clean=title.trim()
  if(!clean||!content.trim()){setError('Enter both a name and prompt text.');return}
  if(clean.length>PROMPT_TITLE_MAX||content.length>PROMPT_CONTENT_MAX){setError('Prompt is too long.');return}
  if(scope&&!projects.some(p=>p.id===scope)){setError('The selected Project is no longer available.');return}
  if(editing==='new'&&prompts.length>=PROMPT_MAX_COUNT){setError('The 100-prompt limit has been reached.');return}
  try{
   const now=Date.now(),old=prompts.find(p=>p.id===editing)
   const saved={id:old?.id||crypto.randomUUID(),title:clean,content,projectId:scope||null,createdAt:old?.createdAt||now,updatedAt:now}
   onWorkspace(w=>({...w,prompts:normalizePrompts((w.prompts||[]).filter(p=>p.id!==saved.id).concat(saved),(w.projects||[]).map(p=>p.id),true)}))
   cancel()
  }catch(e){setError(e.message||'Could not save prompt.')}
 }
 const remove=p=>{if(!window.confirm('Delete saved prompt "'+p.title+'"? Existing chats will not change.'))return;onWorkspace(w=>({...w,prompts:(w.prompts||[]).filter(x=>x.id!==p.id)}));if(editing===p.id)cancel()}
 return <div className="workspacePage promptsPage">
  <div className="workspacePageTop"><div><h1>Prompts</h1><p>Save reusable prompts for all chats or a specific Project. Stored in this browser.</p></div>
   <button className="primary" type="button" onClick={()=>start()} disabled={busy||prompts.length>=PROMPT_MAX_COUNT}><Plus size={16}/> New prompt</button></div>
  {editing&&<form className="promptEditor" onSubmit={save} aria-label="Prompt editor">
   <div className="promptEditorTop"><strong>{editing==='new'?'Create saved prompt':'Edit saved prompt'}</strong><button className="outline" type="button" onClick={cancel}><X size={15}/> Cancel</button></div>
   <label htmlFor="prompt-name">Name</label><input id="prompt-name" maxLength={PROMPT_TITLE_MAX} value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Review this code" required/>
   <label htmlFor="prompt-scope">Available in</label><select id="prompt-scope" value={scope} onChange={e=>setScope(e.target.value)}>
    <option value="">All chats and Projects</option>{projects.map(p=><option key={p.id} value={p.id}>Only {p.name}</option>)}</select>
   <label htmlFor="prompt-body">Prompt text</label><textarea id="prompt-body" rows={7} maxLength={PROMPT_CONTENT_MAX} value={content} onChange={e=>setContent(e.target.value)} placeholder="Write the text you want to reuse…" required/>
   <div className="promptEditorBottom"><small>{content.length.toLocaleString()} / {PROMPT_CONTENT_MAX.toLocaleString()} characters · Never sent automatically</small><button className="primary" type="submit" disabled={busy||!title.trim()||!content.trim()}><Check size={15}/> Save prompt</button></div>
   {error&&<p role="alert" className="projectAlert">{error}</p>}
  </form>}
  <div className="workspaceSearch"><Search size={17}/><input aria-label="Search saved prompts" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search your prompt library"/></div>
  <p className="projectHint">{prompts.length} of {PROMPT_MAX_COUNT} saved · Project-only prompts do not appear in other Projects</p>
  {!matches.length?<div className="workspaceEmpty">{query?'No prompts match that search.':'No saved prompts yet. Create one to reuse it in any chat or Project.'}</div>:
  <div className="promptGrid">{matches.map(p=><article className="promptCard" key={p.id}>
   <header><BookOpen size={17}/><div><strong>{p.title}</strong><small>{p.projectId?'Only '+(projects.find(x=>x.id===p.projectId)?.name||'Project'):'All chats and Projects'}</small></div></header>
   <p>{p.content}</p><div className="actions">
    <button className="primary" type="button" onClick={()=>onUsePrompt(p)} disabled={busy}><ArrowUpRight size={15}/> Use in chat</button>
    <button className="outline" type="button" onClick={()=>start(p)} disabled={busy}><PenLine size={15}/> Edit</button>
    <button className="outline" type="button" onClick={()=>remove(p)} disabled={busy}><Trash2 size={15}/> Delete</button>
   </div>
  </article>)}</div>}
 </div>
}
