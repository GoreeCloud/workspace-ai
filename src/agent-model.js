export const AGENT_MAX_COUNT=60
export const AGENT_TEAM_MAX=4
const safe=(v,n)=>typeof v==='string'?v.trim().slice(0,n):''
const validId=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v)
export function normalizeAgent(a,projects=[]){
 if(!a||typeof a!=='object'||Array.isArray(a))throw Error('Invalid agent')
 if(!validId(a.id)||!validId(a.projectId)||!projects.some(p=>p.id===a.projectId))throw Error('Agent needs an existing project')
 const name=safe(a.name,80),instructions=safe(a.instructions,4000)
 if(!name||!instructions)throw Error('Agent name and instructions are required')
 return {id:a.id,projectId:a.projectId,name,instructions,
 role:['general','research','developer','reviewer','coordinator'].includes(a.role)?a.role:'general',
 createdAt:Number.isFinite(a.createdAt)?a.createdAt:Date.now(),updatedAt:Number.isFinite(a.updatedAt)?a.updatedAt:Date.now()}
}
export function normalizeAgents(value,projects=[]){
 if(!Array.isArray(value))return []
 const ids=new Set(),items=[]
 for(const a of value.slice(0,AGENT_MAX_COUNT)){
  try{const entry=normalizeAgent(a,projects);if(ids.has(entry.id))continue;ids.add(entry.id);items.push(entry)}
  catch{/* Orphaned or malformed agents cannot acquire another project's context. */}
 }
 return items
}
export function newAgent(projectId,name='New agent',role='general'){
 if(!validId(projectId))throw Error('Choose a project for this agent')
 return {id:crypto.randomUUID(),projectId,name,instructions:'Work only within this project. Suggest external actions for explicit human approval; never claim to have used a tool.',role,createdAt:Date.now(),updatedAt:Date.now()}
}
export function assertAgentTeam(agents,projectId){
 if(!Array.isArray(agents)||!agents.length||agents.length>AGENT_TEAM_MAX)throw Error('Choose one to four agents')
 if(agents.some(a=>a.projectId!==projectId))throw Error('Cross-project agent teams are prohibited')
 if(new Set(agents.map(a=>a.id)).size!==agents.length)throw Error('Duplicate agent')
 return agents
}
