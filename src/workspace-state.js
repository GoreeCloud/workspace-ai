export const WORKSPACE_KEY='workspace-ai-workspace-v1'
export const NAV_SECTIONS=[
 {id:'mcp',label:'MCP',icon:'plug'},
 {id:'api',label:'API',icon:'waypoints'},
 {id:'projects',label:'Projects',icon:'folder-kanban'},
 {id:'pinned',label:'Pinned',icon:'pin'},
 {id:'chats',label:'All Chats',icon:'messages-square'},
 {id:'settings',label:'Settings',icon:'settings-2'}
]
export const BLANK_WORKSPACE={projects:[],pinned:[],collapsed:false,expanded:{projects:true,pinned:true,chats:true}}
export function readWorkspace(){
 try{
  const raw=JSON.parse(localStorage.getItem(WORKSPACE_KEY)||'null')
  if(!raw || typeof raw!=='object')return BLANK_WORKSPACE
  return {
   projects:Array.isArray(raw.projects)?raw.projects.filter(v=>typeof v.id==='string'&&typeof v.name==='string').slice(0,100):[],
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
