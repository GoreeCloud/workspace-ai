import React from 'react'
import {Sparkles,Plus,Plug,Waypoints,FolderKanban,BookOpen,Pin,MessagesSquare,Settings2,PanelLeftClose,PanelLeftOpen,ChevronDown,ChevronRight,ShieldCheck,X} from 'lucide-react'
import {NAV_SECTIONS,searchChats} from './workspace-state.js'
import {ProjectGlyph} from './ProjectStudio.jsx'
const ICONS={mcp:Plug,api:Waypoints,projects:FolderKanban,prompts:BookOpen,pinned:Pin,chats:MessagesSquare,settings:Settings2}
export default function WorkspaceNavigation({workspace,onWorkspace,view,onNavigate,chats,current,onSelectChat,onNewChat,mobile,onMobile,selectedProject,onProject,onUsePrompt}){
 const compact=workspace.collapsed&&!mobile
 const pinned=searchChats(chats,'').filter(c=>workspace.pinned.includes(c.id))
 const toggle=id=>onWorkspace(w=>({...w,expanded:{...w.expanded,[id]:!w.expanded[id]}}))
 const pick=id=>{onNavigate(id);onMobile(false)}
 return <>
 {mobile&&<button className="mobileShade" aria-label="Close navigation" onClick={()=>onMobile(false)}/>}
 <aside className={'sidebar workspaceSidebar '+(compact?'compact ':'')+(mobile?'open':'')} aria-label="Workspace navigation">
 <div className="workspaceBrandRow"><button className="brand" onClick={onNewChat} title="Workspace AI"><span className="brandIcon"><Sparkles size={19}/></span>{!compact&&<strong>workspace<span>ai</span></strong>}</button>
 <button className="sidebarCollapse" title={compact?'Expand sidebar':'Collapse sidebar'} aria-label={mobile?'Close navigation':compact?'Expand sidebar':'Collapse sidebar'} onClick={mobile?()=>onMobile(false):()=>onWorkspace(w=>({...w,collapsed:!w.collapsed}))}>{mobile?<X size={19}/>:compact?<PanelLeftOpen size={19}/>:<PanelLeftClose size={19}/>}</button></div>
 <button className="newChat" onClick={()=>{onNewChat();onMobile(false)}} title="New conversation" aria-label="New conversation"><Plus size={18}/>{!compact&&'New conversation'}</button>
 <nav className="workspaceNav" aria-label="Primary">
 {NAV_SECTIONS.map(item=>{const Icon=ICONS[item.id],active=view===item.id||(item.id==='chats'&&view==='chat'),open=workspace.expanded[item.id];return <div key={item.id}>
 <div className={'workspaceNavRow '+(active?'active':'')}>
 <button className="workspaceNavLink" title={item.label} aria-label={item.label} aria-current={active?'page':undefined} onClick={()=>{if(item.id==='projects')onProject(null);pick(item.id)}}><Icon size={18}/>{!compact&&<span>{item.label}</span>}</button>
 {!compact&&['projects','prompts','pinned','chats'].includes(item.id)&&<button className="workspaceNavExpand" onClick={()=>toggle(item.id)} aria-expanded={Boolean(open)} aria-label={(open?'Collapse ':'Expand ')+item.label}>{open?<ChevronDown size={15}/>:<ChevronRight size={15}/>}</button>}</div>
 {!compact&&open&&item.id==='projects'&&<div className="workspaceNavChildren">{workspace.projects.slice(0,8).map(p=><button key={p.id} title={p.name} aria-current={selectedProject===p.id&&active?'page':undefined} onClick={()=>{onProject(p.id);pick('projects')}}><ProjectGlyph icon={p.icon} size={14}/>{p.name}</button>)}<button onClick={()=>pick('projects')}><Plus size={13}/> Manage projects</button></div>}
 {!compact&&open&&item.id==='prompts'&&<div className="workspaceNavChildren">{(workspace.prompts||[]).filter(p=>!p.projectId||p.projectId===selectedProject).slice(0,6).map(p=><button key={p.id} title={p.title} onClick={()=>{onUsePrompt(p);onMobile(false)}}><BookOpen size={13}/>{p.title}</button>)}<button onClick={()=>pick('prompts')}><Plus size={13}/> Manage prompts</button></div>}
 {!compact&&open&&['chats','pinned'].includes(item.id)&&<div className="workspaceNavChildren">{(item.id==='pinned'?pinned:searchChats(chats,'')).slice(0,8).map(c=><button key={c.id} title={c.title} aria-current={current===c.id&&view==='chat'?'page':undefined} onClick={()=>onSelectChat(c.id)}>{c.title}</button>)}{(item.id==='pinned'?pinned:chats).length===0&&<small>{item.id==='pinned'?'Pin chats to find them here':'No conversations yet'}</small>}</div>}
 </div>})}
 </nav><footer className="sideFoot">{!compact&&<div className="private"><ShieldCheck size={18}/><div><b>Private by design</b><small>History stored in browser</small></div></div>}<small className="sig">{compact?'GC':'GOREECLOUD · WORKSPACE AI'}</small></footer>
 </aside></>
}
