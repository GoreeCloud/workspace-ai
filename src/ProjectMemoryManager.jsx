import React,{useState} from 'react'
import {Plus,Trash2,Download} from 'lucide-react'
import {MAX_PROJECT_MEMORY_ENTRIES,createProjectMemoryEntry,normalizeProjectMemoryEntries,exportProjectMemoryMarkdown} from './project-memory-entries.js'
export default function ProjectMemoryManager({project,onUpdate,busy=false}){
 const [title,setTitle]=useState('')
 const [content,setContent]=useState('')
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const entries=project.memoryEntries||[]
 const update=patch=>{
  try{
   if(!onUpdate(patch))throw Error('Browser storage rejected the change.')
   setError('');return true
  }catch(e){setNotice('');setError(e.message);return false}
 }
 const saveEntry=()=>{
  try{
   const entry=createProjectMemoryEntry(title,content,crypto.randomUUID())
   if(update({memoryEntries:normalizeProjectMemoryEntries([...entries,entry])})){setTitle('');setContent('');setNotice('Memory saved to this project only.')}
  }catch(e){setError(e.message)}
 }
 const editEntry=(id,field,value)=>{
  try {
   const updated=entries.map(e=>e.id===id?{...e,[field]:value,updatedAt:Date.now()}:e)
   update({memoryEntries:normalizeProjectMemoryEntries(updated)})
  }catch(e){setError(e.message)}
 }
 const deleteEntry=id=>{
  if(!window.confirm('Delete this memory from '+project.name+'?'))return
  if(update({memoryEntries:entries.filter(e=>e.id!==id)}))setNotice('Memory entry deleted.')
 }
 const clear=()=>{
  if(!window.confirm('Clear all memory notes and entries for '+project.name+'? This cannot be undone.'))return
  if(update({memory:'',memoryEntries:[]}))setNotice('All memory cleared for '+project.name+'.')
 }
 const download=()=>{
  try{
   const markdown=exportProjectMemoryMarkdown(project)
   const url=URL.createObjectURL(new Blob([markdown],{type:'text/markdown;charset=utf-8'}))
   const a=document.createElement('a');a.href=url;a.download=(project.name.replace(/[^\w.-]+/g,'-').slice(0,70)||'project')+'-memory.md'
   document.body.append(a);a.click();a.remove()
   window.setTimeout(()=>URL.revokeObjectURL(url),1000)
   setError('');setNotice('Project memory export prepared locally.')
  }catch(e){setError(e.message)}
 }
 return <section className="projectPanel" aria-label={'Memory for '+project.name}>
  <h3>Private project memory</h3>
  <label><input type="checkbox" checked={project.memoryEnabled!==false} disabled={busy} onChange={e=>update({memoryEnabled:e.target.checked})}/> Include this project's memory in its AI requests</label>
  <label htmlFor="project-memory">Overall memory notes</label>
  <textarea id="project-memory" rows={5} maxLength={4000} value={project.memory||''} disabled={busy} onChange={e=>{update({memory:e.target.value});setNotice('')}} placeholder="Private notes and preferences for this project."/>
  <h4>Individual memories ({entries.length}/{MAX_PROJECT_MEMORY_ENTRIES})</h4>
  {entries.map(entry=><div key={entry.id} className="projectMcpProvider">
    <label>Memory title
     <input key={entry.id+'-title-'+entry.updatedAt} aria-label={'Memory title '+entry.id} defaultValue={entry.title} maxLength={90} disabled={busy} onBlur={e=>{if(e.target.value!==entry.title)editEntry(entry.id,'title',e.target.value)}}/>
    </label>
    <label>Memory content
     <textarea key={entry.id+'-content-'+entry.updatedAt} aria-label={'Memory content '+entry.id} rows={3} maxLength={1200} defaultValue={entry.content} disabled={busy} onBlur={e=>{if(e.target.value!==entry.content)editEntry(entry.id,'content',e.target.value)}}/>
    </label>
    <button type="button" className="outline" disabled={busy} onClick={()=>deleteEntry(entry.id)}><Trash2 size={14}/> Delete this memory</button>
   </div>)}
  <label htmlFor="new-memory-title">New memory title</label>
  <input id="new-memory-title" maxLength={90} value={title} disabled={busy} onChange={e=>setTitle(e.target.value)} placeholder="Project preference"/>
  <label htmlFor="new-memory-content">New memory content</label>
  <textarea id="new-memory-content" rows={3} maxLength={1200} value={content} disabled={busy} onChange={e=>setContent(e.target.value)} placeholder="Remember this only in the current project"/>
  <div className="actions">
   <button type="button" className="outline" disabled={busy||!title.trim()||!content.trim()||entries.length>=MAX_PROJECT_MEMORY_ENTRIES} onClick={saveEntry}><Plus size={15}/> Add memory</button>
   <button type="button" className="outline" disabled={busy} onClick={download}><Download size={15}/> Export memory (.md)</button>
   <button type="button" className="outline" disabled={busy||(!project.memory&&entries.length===0)} onClick={clear}><Trash2 size={15}/> Clear all memory</button>
  </div>
  <p className="projectHint">Memory is enabled by default for new projects, but nothing is automatically remembered from chats. You can disable, edit, export or delete your memories even when memory use is off. No project memories are automatically shared. A deletion affects future AI requests, not already-sent requests, past chats or exported backups.</p>
  {error&&<p className="projectAlert" role="alert">{error}</p>}
  {notice&&<p className="projectSuccess" role="status">{notice}</p>}
 </section>
}
