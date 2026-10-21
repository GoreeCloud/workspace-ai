// Sidebar order and pinning are browser-local workspace preferences and are
// portable in backups. They never alter project ownership or chat context.
export function cleanProjectNavigation(projects,order,pinned){
 const ids=Array.isArray(projects)?projects.map(p=>p.id).filter(id=>typeof id==='string'):[]
 const allowed=new Set(ids)
 const unique=(list)=>[...new Set((Array.isArray(list)?list:[]).filter(id=>typeof id==='string'&&allowed.has(id)))].slice(0,100)
 return {projectOrder:[...unique(order),...ids.filter(id=>!unique(order).includes(id))],pinnedProjects:unique(pinned)}
}
export function orderedProjects(projects,order,pinned){
 const nav=cleanProjectNavigation(projects,order,pinned),positions=new Map(nav.projectOrder.map((id,i)=>[id,i]))
 const favorites=new Set(nav.pinnedProjects)
 return [...projects].sort((a,b)=>(Number(favorites.has(b.id))-Number(favorites.has(a.id)))||(positions.get(a.id)-positions.get(b.id)))
}
export function moveProject(projects,order,pinned,id,direction){
 if(!['up','down'].includes(direction))throw Error('Unknown project order action')
 const nav=cleanProjectNavigation(projects,order,pinned)
 if(!nav.projectOrder.includes(id))throw Error('Unknown project')
 const pinnedSet=new Set(nav.pinnedProjects)
 const sameGroup=nav.projectOrder.filter(v=>pinnedSet.has(v)===pinnedSet.has(id))
 const at=sameGroup.indexOf(id),target=at+(direction==='up'?-1:1)
 if(target<0||target>=sameGroup.length)return nav.projectOrder
 const swap=sameGroup[target]
 const next=nav.projectOrder.slice(),i=next.indexOf(id),j=next.indexOf(swap)
 ;[next[i],next[j]]=[next[j],next[i]]
 return next
}
export function chatsForProject(chats,pinned,projectId){
 const selected=(Array.isArray(chats)?chats:[]).filter(c=>c.projectId===projectId&&c.archived!==true)
 const pins=new Set(Array.isArray(pinned)?pinned:[])
 return selected.sort((a,b)=>Number(pins.has(b.id))-Number(pins.has(a.id))||(b.updatedAt||0)-(a.updatedAt||0))
}
