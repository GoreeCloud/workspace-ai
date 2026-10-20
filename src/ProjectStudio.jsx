import React,{useState} from 'react'
import {Folder,FolderKanban,Sparkles,Code2,BookOpen,BriefcaseBusiness,FlaskConical,Rocket,Globe,Heart,Shield,Palette,Database,Trash2,Plus,Upload,CloudDownload,FileText} from 'lucide-react'
import DropboxBrowser from './DropboxBrowser.jsx'
import {ACCEPT_TEXT_FILES,PROJECT_GLYPHS,PROJECT_API_SERVICES,PROJECT_MCP_SERVICES,PROJECT_FILE_MAX_COUNT,canImportFile,importTextFile,importLocalTextFile} from './project-model.js'
const GLYPHS={folder:Folder,sparkles:Sparkles,code:Code2,book:BookOpen,briefcase:BriefcaseBusiness,flask:FlaskConical,rocket:Rocket,globe:Globe,heart:Heart,shield:Shield,palette:Palette,database:Database}
const SERVICE_LABELS={'google-drive':'Google Drive',gmail:'Gmail',dropbox:'Dropbox',github:'GitHub',todoist:'Todoist',linear:'Linear',cloudflare:'Cloudflare Pages','remote-desktop-commander':'Remote Desktop Commander',firecrawl:'Firecrawl'}
export function ProjectGlyph({icon='folder',size=18}){const Component=GLYPHS[icon]||Folder;return <Component size={size}/>}
export default function ProjectStudio({project,projects,onUpdate,onNewChat,onDelete,chatCount=0,busy=false}){
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[dropboxPath,setDropboxPath]=useState(''),[cloudBusy,setCloudBusy]=useState(false),[browseDropbox,setBrowseDropbox]=useState(false),[fileQuery,setFileQuery]=useState('')
 const update=patch=>onUpdate(project.id,patch)
 const toggle=(field,id)=>{
  const old=Array.isArray(project[field])?project[field]:[]
  update({[field]:old.includes(id)?old.filter(x=>x!==id):[...old,id]})
 }
 async function addFiles(files){
  if(!files?.length)return
  setError('');setNotice('')
  try{
   const available=PROJECT_FILE_MAX_COUNT-(project.files||[]).length
   if(files.length>available)throw Error('This project supports a maximum of '+PROJECT_FILE_MAX_COUNT+' text files.')
   const items=[]
   for(const file of files){
    const problem=canImportFile(file.name,file.size)
    if(problem)throw Error(file.name+': '+problem)
    items.push(await importLocalTextFile(file))
   }
   update({files:[...(project.files||[]),...items]})
   setNotice('Added '+items.length+' local text '+(items.length===1?'file':'files')+' to this project.')
  }catch(e){setError(e.message||'File import failed.')}
 }
 async function importDropbox(selectedPath=dropboxPath){
  setCloudBusy(true);setError('');setNotice('')
  try{
   if((project.files||[]).length>=PROJECT_FILE_MAX_COUNT)throw Error('Project file limit reached.')
   const response=await fetch('/api/integrations/dropbox/import-text',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({path:selectedPath.trim()})
   })
   const data=await response.json()
   if(!response.ok)throw Error(data.error||'Dropbox file unavailable.')
   update({files:[...(project.files||[]),importTextFile({name:data.name,size:data.size},data.content,'dropbox')]})
   setDropboxPath('')
   setNotice('Copied a read-only Dropbox text snapshot into this browser-local project.')
  }catch(e){setError(e.message||'Unable to import Dropbox text.')}finally{setCloudBusy(false)}
 }
 function downloadFile(file){
  const blob=new Blob([file.content],{type:'text/plain;charset=utf-8'})
  const href=URL.createObjectURL(blob)
  const link=document.createElement('a')
  link.href=href
  link.download=file.name.replace(/[\\/]/g,'_')
  document.body.append(link);link.click();link.remove()
  window.setTimeout(()=>URL.revokeObjectURL(href),1000)
 }
 const visibleFiles=(project.files||[]).filter(file=>{
  const search=fileQuery.trim().toLocaleLowerCase()
  return !search||file.name.toLocaleLowerCase().includes(search)||file.content.toLocaleLowerCase().includes(search)
 })
 return <section className="projectStudio" aria-label={'Project '+project.name}>
  <div className="projectStudioHeader"><span className="projectStudioGlyph"><ProjectGlyph icon={project.icon} size={27}/></span><div><h2>{project.name}</h2><p>{chatCount} chats · Private by default · Browser-local</p></div>
  <button className="primary" disabled={busy} onClick={()=>onNewChat(project.id)}><Plus size={16}/> New project chat</button>
  <button className="outline" disabled={busy} onClick={()=>onDelete(project.id)}><Trash2 size={15}/> Delete</button></div>
  <div className="projectStudioGrid">
   <section className="projectPanel"><h3>Identity & instructions</h3>
    <label htmlFor="project-name">Project name</label>
    <input id="project-name" maxLength={90} value={project.name} onChange={e=>{if(e.target.value.trim())update({name:e.target.value})}}/>
    <label>Icon / glyph</label><div className="projectGlyphPicker" role="group" aria-label="Project icon">{PROJECT_GLYPHS.map(icon=><button key={icon} type="button" className={project.icon===icon?'picked':''} title={icon} aria-label={'Project icon '+icon} aria-pressed={project.icon===icon} onClick={()=>update({icon})}><ProjectGlyph icon={icon}/></button>)}</div>
    <label htmlFor="project-instructions">Instructions for this project</label>
    <textarea id="project-instructions" rows={5} maxLength={4000} value={project.instructions||''} onChange={e=>update({instructions:e.target.value})} placeholder="Describe the project's goals, response style, constraints, and tasks."/>
    <p className="projectHint">Project instructions are supplied to the AI when you send a message inside this project. They do not apply to other projects.</p>
   </section>
   <section className="projectPanel"><h3>Memory & boundaries</h3>
    <label htmlFor="project-memory">Project memory notes</label>
    <textarea id="project-memory" rows={5} maxLength={4000} value={project.memory||''} onChange={e=>update({memory:e.target.value})} placeholder="Facts and preferences you want retained in this project."/>
    <p className="projectHint">Manually maintained notes, not automatically generated long-term memory. Projects are isolated unless you grant sharing below.</p>
    {projects.filter(p=>p.id!==project.id).length>0&&<><h4>Share this project's data with</h4>
     {projects.filter(p=>p.id!==project.id).map(p=><div key={p.id} className="projectShareRow"><span><ProjectGlyph icon={p.icon} size={15}/>{p.name}</span>
      <label><input type="checkbox" checked={(project.shareMemoryWith||[]).includes(p.id)} onChange={()=>toggle('shareMemoryWith',p.id)}/> Memory notes</label>
      <label><input type="checkbox" checked={(project.shareFilesWith||[]).includes(p.id)} onChange={()=>toggle('shareFilesWith',p.id)}/> Reference files</label>
     </div>)}
     <p className="projectHint">One-way consent: selecting a destination allows its new AI requests to read the chosen notes or file text from this project. Sharing is off by default.</p></>}
   </section>
   <section className="projectPanel"><h3>Project files</h3><p className="projectHint">Text and source files are stored locally in this browser, then included as bounded reference context when chatting. Maximum {PROJECT_FILE_MAX_COUNT} files, 64 KB each. PDF, image and binary parsing are not supported yet.</p>
    <label className="projectUpload"><Upload size={16}/> Import from phone or laptop<input aria-label="Upload project text files" type="file" multiple accept={ACCEPT_TEXT_FILES} onChange={e=>{const files=Array.from(e.target.files||[]);e.target.value='';void addFiles(files)}}/></label>
    <h4>Import a Dropbox text file</h4>
    <div className="projectCloudRow"><input aria-label="Dropbox file path" placeholder="/Documents/notes.md" value={dropboxPath} maxLength={1024} onChange={e=>setDropboxPath(e.target.value)}/>
    <button className="outline" disabled={cloudBusy||busy||!dropboxPath.trim()} onClick={()=>importDropbox()}><CloudDownload size={16}/>{cloudBusy?'Importing…':'Import'}</button></div>
    <button className="outline" type="button" aria-expanded={browseDropbox} onClick={()=>setBrowseDropbox(v=>!v)}>{browseDropbox?'Close Dropbox browser':'Browse Dropbox files'}</button>
    {browseDropbox&&<DropboxBrowser importing={cloudBusy} onSelectFile={item=>importDropbox(item.path)}/>}
    <p className="projectHint">Requires an already-connected Dropbox session in API integrations. Copies a read-only text snapshot. Google Drive requires its own OAuth integration and is not yet supported for import.</p>
    {(project.files||[]).length>0&&<><label htmlFor="project-file-search">Search project files</label><input id="project-file-search" value={fileQuery} onChange={e=>setFileQuery(e.target.value)} placeholder="Search file names and contents"/></>}
    {visibleFiles.length>0?<ul className="projectFileList">{visibleFiles.map(file=><li key={file.id} className="projectFileItem">
    <div className="projectFileTop"><span><FileText size={16}/><strong>{file.name}</strong><small>{file.source==='dropbox'?'Dropbox snapshot':'Local'}</small></span>
    <button className="iconAction" aria-label={'Download '+file.name} title="Download file" onClick={()=>downloadFile(file)}><CloudDownload size={16}/></button>
    <button className="iconAction" aria-label={'Remove '+file.name} onClick={()=>update({files:project.files.filter(f=>f.id!==file.id)})}><Trash2 size={16}/></button></div>
    <details className="projectFilePreview"><summary>Preview text</summary><pre>{file.content.slice(0,8000)}{file.content.length>8000?'\n[Preview truncated; download for full text]':''}</pre></details>
    </li>)}</ul>:<p className="projectHint">{(project.files||[]).length?'No files match this search.':'No reference files in this project yet.'}</p>}
   </section>
   <section className="projectPanel"><h3>Plugins & MCP access profiles</h3><p className="projectHint">Choose which integrations belong to this project. These are local configuration preferences, not active permissions. Existing provider connections are separate; tool execution remains disabled pending authorization and provider implementations.</p>
    <h4>API integrations</h4><div className="projectToggles">{PROJECT_API_SERVICES.map(id=><label key={id}><input type="checkbox" checked={(project.api||[]).includes(id)} onChange={()=>toggle('api',id)}/>{SERVICE_LABELS[id]}</label>)}</div>
    <h4>MCP services</h4><div className="projectToggles">{PROJECT_MCP_SERVICES.map(id=><label key={id}><input type="checkbox" checked={(project.mcp||[]).includes(id)} onChange={()=>toggle('mcp',id)}/>{SERVICE_LABELS[id]}</label>)}</div>
   </section>
  </div>
  {error&&<p className="projectAlert" role="alert">{error}</p>}{notice&&<p className="projectSuccess" role="status">{notice}</p>}
 </section>
}
