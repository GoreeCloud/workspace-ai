// Project workspaces: validated browser-local metadata and explicit sharing only.
export const PROJECT_GLYPHS = ['folder','sparkles','code','book','briefcase','flask','rocket','globe','heart','shield','palette','database']
export const PROJECT_API_SERVICES = ['todoist','github','dropbox','linear','google-drive','gmail','cloudflare']
export const PROJECT_MCP_SERVICES = ['remote-desktop-commander','firecrawl']
export const PROJECT_FILE_MAX_BYTES = 64 * 1024
export const PROJECT_FILE_MAX_COUNT = 10
export const PROJECT_TEXT_BUDGET = 7000
const text = (s,n) => typeof s === 'string' ? s.slice(0,n) : ''
const list = (a,n) => Array.isArray(a) ? a.filter(v=>typeof v==='string').slice(0,n) : []
export const ACCEPT_TEXT_FILES = '.txt,.md,.markdown,.csv,.tsv,.json,.yaml,.yml,.log,.js,.jsx,.ts,.tsx,.py,.html,.css,.xml,.sql'
const extensions = new Set(ACCEPT_TEXT_FILES.split(','))
export function newProject(id,name,createdAt=Date.now()) {
 return {id,name,createdAt,icon:'folder',instructions:'',memory:'',shareMemoryWith:[],shareFilesWith:[],api:[],mcp:[],files:[]}
}
export function normalizeProject(project) {
 if (!project || typeof project !== 'object' || Array.isArray(project) || typeof project.id!=='string' || !project.id || project.id.length>160 ||
 typeof project.name!=='string' || !project.name.trim() || project.name.length>90) throw Error('Invalid project metadata')
 const data = newProject(project.id,project.name,Number.isFinite(project.createdAt) ? project.createdAt : 0)
 data.icon = PROJECT_GLYPHS.includes(project.icon) ? project.icon : 'folder'
 data.instructions = text(project.instructions,4000)
 data.memory = text(project.memory,4000)
 data.shareMemoryWith = [...new Set(list(project.shareMemoryWith,100))]
 data.shareFilesWith = [...new Set(list(project.shareFilesWith,100))]
 data.api = [...new Set(list(project.api,PROJECT_API_SERVICES.length))].filter(v=>PROJECT_API_SERVICES.includes(v))
 data.mcp = [...new Set(list(project.mcp,PROJECT_MCP_SERVICES.length))].filter(v=>PROJECT_MCP_SERVICES.includes(v))
 const files = Array.isArray(project.files) ? project.files : []
 if(files.length>PROJECT_FILE_MAX_COUNT) throw Error('Project has too many files')
 const ids=new Set()
 data.files=files.map(f=>{
  if(!f||typeof f!=='object'||typeof f.id!=='string'||!f.id||f.id.length>160||
   typeof f.name!=='string'||!f.name||f.name.length>200||typeof f.content!=='string'||f.content.includes(String.fromCharCode(0))||canImportFile(f.name,new TextEncoder().encode(f.content||'').length)!==null||
   new TextEncoder().encode(f.content).length>PROJECT_FILE_MAX_BYTES) throw Error('Invalid project file')
  if(ids.has(f.id))throw Error('Duplicate project file')
  ids.add(f.id)
  return {id:f.id,name:f.name,content:f.content,source:['local','dropbox'].includes(f.source)?f.source:'local',
   createdAt:Number.isFinite(f.createdAt)?f.createdAt:0}
 })
 return data
}
export function normalizeProjects(projects) {
 if(!Array.isArray(projects)) return []
 if(projects.length>100) throw Error('Too many projects')
 const ids = new Set()
 const normalized = projects.map(p=>{
  const item=normalizeProject(p)
  if(ids.has(item.id))throw Error('Duplicate project ID')
  ids.add(item.id)
  return item
 })
 return normalized.map(p=>({...p,
  shareMemoryWith:p.shareMemoryWith.filter(id=>ids.has(id)&&id!==p.id),
  shareFilesWith:p.shareFilesWith.filter(id=>ids.has(id)&&id!==p.id)
 }))
}
export function canImportFile(name,size) {
 if(typeof name!=='string'||name.length>200||!extensions.has('.'+(name.split('.').pop()||'').toLowerCase()))
  return 'Only supported text/code files can be imported (TXT, Markdown, CSV, JSON, YAML, source code and similar).'
 if(!Number.isSafeInteger(size)||size<0||size>PROJECT_FILE_MAX_BYTES)
  return 'File exceeds the 64 KB limit.'
 return null
}
export function importTextFile(file,content,source='local') {
 const problem=canImportFile(file.name,file.size)
 if(problem)throw Error(problem)
 if(typeof content!=='string'||new TextEncoder().encode(content).length>PROJECT_FILE_MAX_BYTES)throw Error('File content exceeds 64 KB.')
 if(content.includes('\u0000'))throw Error('Binary files cannot be imported.')
 return {id:crypto.randomUUID(),name:file.name,content,source,createdAt:Date.now()}
}
export async function importLocalTextFile(file) {
 const problem=canImportFile(file?.name,file?.size)
 if(problem)throw Error(problem)
 if(typeof file.arrayBuffer!=='function')throw Error('Cannot read the selected file.')
 let content
 try{content=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer())}
 catch{throw Error('Selected file is not valid UTF-8 text.')}
 return importTextFile(file,content)
}
export {projectContext, rankedProjectFiles, relevantExcerpt, inferenceMessages} from "./project-context.js"
