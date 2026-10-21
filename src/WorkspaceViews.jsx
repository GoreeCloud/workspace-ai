import React,{useEffect,useRef,useState} from 'react'
import {FolderKanban,Pin,PinOff,Search,Plus,Trash2,Plug,Waypoints,Settings2,RefreshCw,Archive,ArchiveRestore,KeyRound,ChevronDown,ChevronUp,ListTodo,Pencil,Check,X,Ellipsis} from 'lucide-react'
import {searchChats} from './workspace-state.js'
import TodoistBrowser from './TodoistBrowser.jsx'
import GitHubBrowser from './GitHubBrowser.jsx'
import DropboxBrowser from './DropboxBrowser.jsx'
import ProjectStudio,{ProjectGlyph} from './ProjectStudio.jsx'
import {newProject,normalizeProject} from './project-model.js'
import PromptsView from './PromptsView.jsx'
import AgentStudio from './AgentStudio.jsx'
import DocumentStudio from './DocumentStudio.jsx'
import EngineeringStudio from './EngineeringStudio.jsx'
import SettingsCategories from './SettingsCategories.jsx'
import {chatsForProject} from './project-sidebar.js'
async function post(url,body){
 const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body||{})})
 const result=await response.json();if(!response.ok)throw Error(result.error||'Request failed');return result
}
const STATUS={connected:'Connected',invalid:'Rejected',restricted:'Restricted',unavailable:'Unavailable','ready-for-discovery':'Ready for discovery','setup-required':'Setup required'}
function IntegrationsView({kind}){
 const [services,setServices]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState('')
 const [editing,setEditing]=useState(null),[tokens,setTokens]=useState({}),[busy,setBusy]=useState(null),[details,setDetails]=useState(null),[browser,setBrowser]=useState(null)
 const refresh=async()=>{
  try{const r=await fetch('/api/integrations');if(!r.ok)throw Error('Integration service unavailable');const j=await r.json();setServices(j.services||[]);setError('')}
  catch(e){setError(e.message||'Unable to load services')}finally{setLoading(false)}
 }
 useEffect(()=>{refresh()},[])
 const action=async(id,operation,body)=>{
  setBusy(id);setError('')
  try{const result=await post('/api/integrations/'+id+'/'+operation,body);setDetails(id);setEditing(null);setTokens(t=>({...t,[id]:''}));if(operation==='disconnect')setBrowser(null);await refresh();if(['invalid','restricted','unavailable'].includes(result.status))setError(result.message)}
  catch(e){setError(e.message||'Action failed')}finally{setBusy(null)}
 }
 return <div className="workspacePage"><div className="workspacePageTop"><div><h1>{kind==='mcp'?'MCP connections':'API integrations'}</h1><p>{kind==='mcp'?'Discover tools from authorized Model Context Protocol servers.':'Manage optional services from your local Workspace AI server.'}</p></div><button className="outline" onClick={refresh}><RefreshCw size={16}/> Refresh</button></div>
 <p className="workspaceToolNote">ChatGPT connectors are separate from this app. Verification is read-only. Tool execution requires a future approvals framework and is disabled.</p>
 {error&&<p className="notice error" role="alert">{error}</p>}
 {loading?<p>Loading…</p>:<div className="workspaceCards">{services.filter(s=>s.kind===kind).map(s=><div className="workspaceCard" key={s.id}>
  <div className="workspaceCardHeader"><div className="workspaceCardHead"><span className="workspaceServiceIcon">{kind==='mcp'?<Plug size={20}/>:<Waypoints size={20}/>}</span><div><strong>{s.name}</strong><small>{s.category}</small></div></div><span className={'workspaceStatus '+(s.connected?'connected':'')}>{STATUS[s.status]||s.status}</span></div>
  <p>{s.message}</p><div className="actions">
  {s.kind==='api'&&s.auth==='token'&&!s.hasSessionToken&&<button className="outline" onClick={()=>setEditing(editing===s.id?null:s.id)}><KeyRound size={15}/> Enter token</button>}
  {s.kind==='mcp'&&s.authConfigured&&<button className="outline" onClick={()=>action(s.id,'discover')} disabled={busy===s.id}><Plug size={15}/> Discover tools</button>}
  {s.id==='dropbox'&&s.hasSessionToken&&<button className="outline" aria-expanded={browser===s.id} onClick={()=>setBrowser(browser===s.id?null:s.id)}>Browse files</button>}
  {s.id==='github'&&s.hasSessionToken&&<button className="outline" aria-expanded={browser===s.id} onClick={()=>setBrowser(browser===s.id?null:s.id)}>Browse repositories</button>}
  {s.id==='todoist'&&s.hasSessionToken&&<button className="outline" aria-expanded={browser===s.id} onClick={()=>setBrowser(browser===s.id?null:s.id)}><ListTodo size={15}/> {browser===s.id?'Close preview':'Browse projects & tasks'}</button>}
  {s.kind==='api'&&s.hasSessionToken&&<button className="outline" onClick={()=>action(s.id,'verify')} disabled={busy===s.id}><RefreshCw size={15}/> Verify connection</button>}
  {(s.connected||s.hasSessionToken)&&<button className="outline" onClick={()=>action(s.id,'disconnect')} disabled={busy===s.id}>Disconnect</button>}
  <button className="outline" aria-expanded={details===s.id} onClick={()=>setDetails(details===s.id?null:s.id)}>Capabilities {details===s.id?<ChevronUp size={15}/>:<ChevronDown size={15}/>}</button></div>
  {s.id==='todoist'&&browser===s.id&&s.hasSessionToken&&<TodoistBrowser/>}
  {s.id==='github'&&browser===s.id&&s.hasSessionToken&&<GitHubBrowser/>}
  {s.id==='dropbox'&&browser===s.id&&s.hasSessionToken&&<DropboxBrowser/>}
  {editing===s.id&&<form className="workspaceTokenForm" onSubmit={e=>{e.preventDefault();action(s.id,'connect',{token:tokens[s.id]||''})}}><label htmlFor={'integration-'+s.id}>{s.name} token</label><input id={'integration-'+s.id} type="password" maxLength={2048} autoComplete="off" spellCheck={false} value={tokens[s.id]||''} onChange={e=>setTokens(t=>({...t,[s.id]:e.target.value}))} placeholder="Paste access token" required/><button className="primary" type="submit" disabled={busy===s.id||!(tokens[s.id]||'').trim()}>{busy===s.id?'Checking…':'Verify connection'}</button><small>Only server memory stores this token. No remote modifications are performed.</small></form>}
  {details===s.id&&<ul className="workspaceToolList">{(s.tools||[]).map(t=><li key={t.name}><span><strong>{t.name}</strong><br/><small>{t.description}</small></span><small>Not executable</small></li>)}</ul>}
  {s.auth==='oauth'&&<p className="workspaceToolNote">Provider OAuth application registration is required; not yet available.</p>}
  {s.kind==='mcp'&&!s.authConfigured&&<p className="workspaceToolNote">Set an approved HTTPS MCP URL in the local server environment to enable discovery.</p>}
 </div>)}</div>}</div>
}
function ChatRow({chat,pinned,onSelect,onPin,onDelete,onAssign,onRename,onArchive,projects}){
 const [editing,setEditing]=useState(false),[title,setTitle]=useState(chat.title||'')
 const save=()=>{if(!title.trim())return;onRename(chat.id,title);setEditing(false)}
 return <div className="workspaceChatRow">
 {editing?<form className="workspaceRename" onSubmit={e=>{e.preventDefault();save()}}>
  <input autoFocus aria-label="New conversation title" maxLength={90} value={title} onChange={e=>setTitle(e.target.value)} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();setEditing(false);setTitle(chat.title||'')}}}/>
  <button className="iconAction" aria-label="Save conversation title" type="submit" disabled={!title.trim()}><Check size={16}/></button>
  <button className="iconAction" aria-label="Cancel rename" type="button" onClick={()=>{setEditing(false);setTitle(chat.title||'')}}><X size={16}/></button>
 </form>:<button className="chatJump" onClick={()=>onSelect(chat.id)}><strong>{chat.title||'Conversation'}</strong><small>{new Date(chat.updatedAt||Date.now()).toLocaleDateString()}</small></button>}
 <select title="Moving a chat starts a new AI context; earlier messages stay visible only." aria-label={'Assign '+(chat.title||'chat')+' to project'} value={chat.projectId||''} onChange={e=>onAssign(chat.id,e.target.value||null)}><option value="">No project</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
 <button className="iconAction" title="Rename" aria-label="Rename chat" onClick={()=>{setTitle(chat.title||'');setEditing(true)}} disabled={editing}><Pencil size={16}/></button>
 <button className="iconAction" title={pinned?'Unpin':'Pin'} aria-label={pinned?'Unpin chat':'Pin chat'} onClick={()=>onPin(chat.id)}>{pinned?<PinOff size={16}/>:<Pin size={16}/>}</button>
 <button className="iconAction" title={chat.archived?'Restore from archive':'Archive'} aria-label={(chat.archived?'Restore ':'Archive ')+(chat.title||'chat')} onClick={()=>onArchive(chat.id,!chat.archived)}>{chat.archived?<ArchiveRestore size={16}/>:<Archive size={16}/>}</button>
 <button className="iconAction" title="Delete" aria-label="Delete chat" onClick={()=>onDelete(chat.id)}><Trash2 size={16}/></button></div>
}
export default function WorkspaceViews({view,chats,workspace,onWorkspace,onSelectChat,onNewChat,onDeleteChat,onAssignChat,onRenameChat,onArchiveChat,onDeleteProject,selectedProject,onProject,onOpenSettings,focusSearchRequest=0,busy=false,onUsePrompt,onOpenProject}){
 const [query,setQuery]=useState(''),[name,setName]=useState(''),[createMemory,setCreateMemory]=useState(true)
 const searchRef=useRef(null)
 useEffect(()=>{if(view==='chats'&&focusSearchRequest>0)searchRef.current?.focus()},[focusSearchRequest,view])
 const pin=id=>onWorkspace(w=>({...w,pinned:w.pinned.includes(id)?w.pinned.filter(v=>v!==id):[...w.pinned,id]}))
 const project=workspace.projects.find(p=>p.id===selectedProject)
 const eligible=chats.filter(c=>view==='archived'?c.archived===true:c.archived!==true)
 const filtered=searchChats(view==='pinned'?eligible.filter(c=>workspace.pinned.includes(c.id)):eligible,query,view==='projects'?selectedProject:null)
 const pins=new Set(workspace.pinned||[])
 const shown=(view==='projects'&&selectedProject?chatsForProject(filtered,workspace.pinned,selectedProject):filtered.sort((a,b)=>Number(pins.has(b.id))-Number(pins.has(a.id))||(b.updatedAt||0)-(a.updatedAt||0)))
 const create=()=>{const title=name.trim().slice(0,90);if(!title||workspace.projects.length>=100)return;const id=crypto.randomUUID();if(!onWorkspace(w=>({...w,projects:[...w.projects,{...newProject(id,title),memoryEnabled:createMemory}]})))return;onProject(id);setName('');setCreateMemory(true)}
 const updateProject=(id,patch)=>onWorkspace(w=>({...w,projects:w.projects.map(p=>p.id===id?normalizeProject({...p,...(typeof patch==='function'?patch(p):patch)}):p)}))
  const removeProject=()=>{
   if(busy||!project)return
   if(!confirm('Delete project '+project.name+'? Its private memory, agents and prompts will be removed. Chats remain visible but their previous messages will no longer be sent to the AI. IMPORTANT: server-scheduled agent jobs are independent and can continue running. Remove those separately under Agents before deleting this project.'))return
   if(onDeleteProject?.(project.id))onProject(null)
  }
 if(view==='documents')return <DocumentStudio/>
 if(view==='engineering')return <EngineeringStudio workspace={workspace} onWorkspace={onWorkspace}/>
 if(view==='agents')return <AgentStudio workspace={workspace} onWorkspace={onWorkspace} selectedProject={selectedProject} onProject={onProject} onOpenProject={onOpenProject} busy={busy}/>
 if(view==='prompts')return <PromptsView workspace={workspace} onWorkspace={onWorkspace} onUsePrompt={onUsePrompt} defaultProjectId={selectedProject} busy={busy}/>
 if(view==='mcp'||view==='api')return <IntegrationsView key={view} kind={view}/>
 if(view==='settings')return <SettingsCategories onOpen={onOpenSettings}/>
 return <div className="workspacePage">
 <div className="workspacePageTop"><div><h1>{view==='projects'?'Projects':view==='pinned'?'Pinned':view==='archived'?'Archived chats':'All Chats'}</h1><p>{view==='projects'?'Organize chats into projects stored in this browser.':view==='pinned'?'Your important conversations.':'Search and organize your conversation history.'}</p></div>{view!=='projects'&&<button className="primary" onClick={()=>onNewChat()}><Plus size={16}/> New chat</button>}</div>
 {view==='projects'&&<><form className="workspaceProjectActions" onSubmit={e=>{e.preventDefault();create()}}><input aria-label="Project name" value={name} maxLength={90} onChange={e=>setName(e.target.value)} placeholder="New project name"/><label className="projectMemoryCreate"><input type="checkbox" checked={createMemory} onChange={e=>setCreateMemory(e.target.checked)}/> Enable memory (default on)</label><button className="primary" type="submit" disabled={!name.trim()||workspace.projects.length>=100}><Plus size={16}/> Create project</button></form>
 <div className="workspaceProjectActions">{workspace.projects.map(p=><div className="workspaceProjectChip" key={p.id}>
 <button className={selectedProject===p.id?'primary':'outline'} onClick={()=>onProject(p.id)}><ProjectGlyph icon={p.icon} size={16}/>{p.name}</button>
 <details className="workspaceProjectMenu"><summary title={'Settings for '+p.name} aria-label={'Project settings for '+p.name}><Ellipsis size={16}/></summary>
 <div className="workspaceProjectMenuPanel" role="group" aria-label={'Settings for '+p.name}><strong>Project settings</strong>
 <label><input type="checkbox" checked={p.memoryEnabled===true} onChange={e=>updateProject(p.id,{memoryEnabled:e.target.checked})}/> Enable memory</label>
 <small>Memory stays within each project. Disabling pauses memory use without deleting notes. Moving a chat starts a fresh AI context while retaining old messages for display.</small>
 <button className="outline" type="button" onClick={()=>onProject(p.id)}>Open project</button></div></details>
 </div>)}{selectedProject&&<button className="outline" onClick={()=>onProject(null)}>All projects</button>}</div>{project&&<ProjectStudio project={project} projects={workspace.projects} onUpdate={updateProject} onNewChat={onNewChat} onDelete={removeProject} chatCount={chats.filter(c=>c.projectId===project.id).length} busy={busy}/>} </>}
 <div className="workspaceSearch"><Search size={17}/><input ref={searchRef} aria-label="Search conversations" placeholder="Search chats and messages" value={query} onChange={e=>setQuery(e.target.value)}/></div>
 {shown.length?shown.map(c=><ChatRow key={c.id} chat={c} pinned={workspace.pinned.includes(c.id)} onSelect={onSelectChat} onPin={pin} onDelete={onDeleteChat} onAssign={onAssignChat} onRename={onRenameChat} onArchive={onArchiveChat} projects={workspace.projects}/>):<div className="workspaceEmpty">No matching conversations yet.</div>}</div>
}
