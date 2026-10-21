import {normalizeProject,normalizeProjects} from './project-model.js'
import {normalizePrompts} from './prompt-library.js'
import {normalizeAgents} from './agent-model.js'
import {cleanProjectNavigation} from './project-sidebar.js'
import {accountScopedKey} from './account-workspace-scope.js'
export const WORKSPACE_KEY='workspace-ai-workspace-v1'
export const NAV_SECTIONS=[
 {id:'mcp',label:'MCP',icon:'plug'},
 {id:'api',label:'API',icon:'waypoints'},
 {id:'projects',label:'Projects',icon:'folder-kanban'},
 {id:'agents',label:'Agents',icon:'bot'},
 {id:'engineering',label:'Engineering',icon:'workflow'},
 {id:'documents',label:'Documents',icon:'files'},
 {id:'images',label:'Smart Images',icon:'images'},
 {id:'prompts',label:'Prompts',icon:'book-open'},
 {id:'pinned',label:'Pinned',icon:'pin'},
 {id:'chats',label:'All Chats',icon:'messages-square'},
 {id:'archived',label:'Archived',icon:'archive'},
 {id:'settings',label:'Settings',icon:'settings-2'}
]
export const BLANK_WORKSPACE={projects:[],projectOrder:[],pinnedProjects:[],agents:[],prompts:[],pinned:[],preferences:{appearance:'system'},collapsed:false,expanded:{projects:true,agents:true,prompts:true,pinned:true,chats:true}}
export function readWorkspace(){
 try{
  const raw=JSON.parse(localStorage.getItem(accountScopedKey(WORKSPACE_KEY))||'null')
  if(!raw || typeof raw!=='object')return BLANK_WORKSPACE
  const projects=Array.isArray(raw.projects)?normalizeProjects(raw.projects.slice(0,100).flatMap(p=>{try{return [normalizeProject(p)]}catch{return []}})):[]
  return {
   projects,...cleanProjectNavigation(projects,raw.projectOrder,raw.pinnedProjects),agents:normalizeAgents(raw.agents||[],projects),
   preferences:{appearance:['light','dark','system'].includes(raw.preferences?.appearance)?raw.preferences.appearance:'system'},
   prompts:normalizePrompts(raw.prompts||[],Array.isArray(raw.projects)?raw.projects.map(p=>p?.id):[]),
   pinned:Array.isArray(raw.pinned)?raw.pinned.filter(v=>typeof v==='string').slice(0,200):[],
   collapsed:raw.collapsed===true,
   expanded:{...BLANK_WORKSPACE.expanded,...(raw.expanded||{})}
  }
 }catch{return BLANK_WORKSPACE}
}
export function searchChats(chats,term,projectId){
 const q=String(term||'').trim().toLowerCase()
 return chats.filter(c=>(!projectId||c.projectId===projectId)&&(!q||[c.title,...(c.messages||[]).map(m=>m.content)].some(v=>typeof v==='string'&&v.toLowerCase().includes(q))))
 .sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0))
}
export function defaultToolGrants(){return {}}
