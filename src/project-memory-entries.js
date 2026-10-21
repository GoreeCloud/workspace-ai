// Explicit project-owned memory records. No global store, cross-project grants or auto-saving.
export const MAX_PROJECT_MEMORY_ENTRIES=32
export const MAX_PROJECT_MEMORY_ENTRY_CHARS=1200
const safe=(v,max)=>typeof v==='string'?v.trim().slice(0,max):''
const record=v=>v&&typeof v==='object'&&!Array.isArray(v)
export function normalizeProjectMemoryEntries(value){
 if(value==null)return []
 if(!Array.isArray(value)||value.length>MAX_PROJECT_MEMORY_ENTRIES)throw Error('Too many project memories')
 const ids=new Set()
 return value.map(item=>{
  if(!record(item)||typeof item.id!=='string'||!/^[a-zA-Z0-9_-]{1,160}$/.test(item.id))throw Error('Invalid project memory ID')
  if(ids.has(item.id))throw Error('Duplicate project memory ID')
  ids.add(item.id)
  const title=safe(item.title,90),content=safe(item.content,MAX_PROJECT_MEMORY_ENTRY_CHARS)
  if(!title||!content)throw Error('Memory title and content are required')
  if(typeof item.content!=='string'||item.content.length>MAX_PROJECT_MEMORY_ENTRY_CHARS)throw Error('Memory entry exceeds 1,200 characters')
  const createdAt=Number.isFinite(item.createdAt)&&item.createdAt>=0?item.createdAt:0
  const updatedAt=Number.isFinite(item.updatedAt)&&item.updatedAt>=0?item.updatedAt:createdAt
  return {id:item.id,title,content,createdAt,updatedAt}
 })
}
export function createProjectMemoryEntry(title,content,id,now=Date.now()){
 return normalizeProjectMemoryEntries([{id,title,content,createdAt:now,updatedAt:now}])[0]
}
export function updateProjectMemoryEntry(entries,id,patch,now=Date.now()){
 return normalizeProjectMemoryEntries(entries).map(entry=>entry.id===id?
  {...entry,...(patch.title!==undefined?{title:safe(patch.title,90)}:{}),...(patch.content!==undefined?{content:safe(patch.content,MAX_PROJECT_MEMORY_ENTRY_CHARS)}:{}),updatedAt:now}:entry)
}
export function deleteProjectMemoryEntry(entries,id){
 return normalizeProjectMemoryEntries(entries).filter(entry=>entry.id!==id)
}
export function exportProjectMemoryMarkdown(project){
 const heading=safe(project?.name,90).replace(/[\r\n#]/g,' ')||'Project'
 const entries=normalizeProjectMemoryEntries(project?.memoryEntries)
 const lines=['# '+heading+' — project memory','','Memory enabled: '+(project?.memoryEnabled!==false?'Yes':'No'),'','## Overall notes','',typeof project?.memory==='string'?project.memory:'','']
 for(const entry of entries)lines.push('## '+entry.title,'','ID: '+entry.id,'','Created: '+new Date(entry.createdAt).toISOString(),'','Updated: '+new Date(entry.updatedAt).toISOString(),'',''+entry.content,'')
 return lines.join('\n')
}
