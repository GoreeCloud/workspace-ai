import React,{useState} from 'react'
import {Pin,PinOff,ArrowUp,ArrowDown,GripVertical,MessagesSquare} from 'lucide-react'
import {ProjectGlyph} from './ProjectStudio.jsx'
import {orderedProjects,moveProject,reorderProject,chatsForProject} from './project-sidebar.js'

// Keyboard reorder controls complement drag and drop, which is not available
// on all mobile browsers and assistive devices.
export default function ProjectSidebarItems({workspace,onWorkspace,chats,current,selectedProject,onProject,onNavigate,onSelectChat}){
 const [dragging,setDragging]=useState(null)
 const projects=orderedProjects(workspace.projects||[],workspace.projectOrder,workspace.pinnedProjects)
 const pinnedSet=new Set(workspace.pinnedProjects||[])
 const chatPins=new Set(workspace.pinned||[])
 const apply=(fn)=>onWorkspace(w=>({...w,...fn(w)}))
 const togglePin=id=>apply(w=>({pinnedProjects:pinnedSet.has(id)?(w.pinnedProjects||[]).filter(v=>v!==id):[...(w.pinnedProjects||[]),id]}))
 const shift=(id,direction)=>apply(w=>({projectOrder:moveProject(w.projects,w.projectOrder,w.pinnedProjects,id,direction)}))
 const reorder=(source,target)=>apply(w=>({projectOrder:reorderProject(w.projects,w.projectOrder,w.pinnedProjects,source,target)}))
 return <div className="workspaceNavChildren projectSideChildren">
 {projects.map((project,i)=>{
  const pinned=pinnedSet.has(project.id)
  const siblings=projects.filter(p=>pinnedSet.has(p.id)===pinned),at=siblings.findIndex(p=>p.id===project.id)
  const projectChats=chatsForProject(chats,workspace.pinned||[],project.id)
  const pinnedChats=projectChats.filter(c=>chatPins.has(c.id))
  const visibleChats=selectedProject===project.id?projectChats.slice(0,8):pinnedChats.slice(0,4)
  return <div className="projectNavGroup" key={project.id} draggable onDragStart={e=>{setDragging(project.id);e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',project.id)}} onDragEnd={()=>setDragging(null)} onDragOver={e=>{if(dragging&&dragging!==project.id&&pinnedSet.has(dragging)===pinned){e.preventDefault();e.dataTransfer.dropEffect='move'}}} onDrop={e=>{e.preventDefault();if(dragging&&dragging!==project.id){try{reorder(dragging,project.id)}catch{}}setDragging(null)}}>
   <div className={'projectNavGroupTitle '+(selectedProject===project.id?'selected':'')} >
    <GripVertical size={13} aria-hidden="true"/>
    <button className="projectNavJump" type="button" title={project.name} aria-current={selectedProject===project.id?'page':undefined} onClick={()=>{onProject(project.id);onNavigate('projects')}}><ProjectGlyph icon={project.icon} size={15}/><span>{project.name}</span></button>
    <button className="projectNavAction" title={pinned?'Unpin project':'Pin project to top'} aria-label={(pinned?'Unpin ':'Pin ')+project.name} onClick={()=>togglePin(project.id)}>{pinned?<PinOff size={13}/>:<Pin size={13}/>}</button>
    <button className="projectNavAction" disabled={at===0} title="Move project up" aria-label={'Move '+project.name+' up'} onClick={()=>shift(project.id,'up')}><ArrowUp size={13}/></button>
    <button className="projectNavAction" disabled={at===siblings.length-1} title="Move project down" aria-label={'Move '+project.name+' down'} onClick={()=>shift(project.id,'down')}><ArrowDown size={13}/></button>
   </div>
   {visibleChats.length>0&&<div className="projectNavChats">{visibleChats.map(c=><button key={c.id} type="button" className="projectNavChat" aria-current={current===c.id?'page':undefined} onClick={()=>onSelectChat(c.id)} title={c.title}>{chatPins.has(c.id)?<Pin size={12}/>:<MessagesSquare size={12}/>}<span>{c.title}</span></button>)}</div>}
  </div>
 })}
 {projects.length===0&&<small>No projects yet</small>}
 <button type="button" onClick={()=>onNavigate('projects')}>Manage projects</button>
 </div>
}
