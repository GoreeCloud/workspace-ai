import {normalizeProject,normalizeProjects} from './project-model.js'
import {normalizePrompts} from './prompt-library.js'
import {normalizeAgents} from './agent-model.js'
import {cleanProjectNavigation} from './project-sidebar.js'
import {normalizeChatAttachments} from './chat-attachments.js'
// A versioned, portable, local-only archive. Credentials and service sessions never enter this format.
export const BACKUP_KIND = 'goreecloud.workspace-ai.backup'
export const BACKUP_VERSION = 1
export const BACKUP_MAX_BYTES = 12 * 1024 * 1024
export const BACKUP_MAX_CHATS = 50
const MAX_PROJECTS = 100
const MAX_MESSAGES = 500

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
function requiredString(value, label, max) {
 if (typeof value !== 'string' || !value.trim() || value.length > max) throw Error('Invalid ' + label)
 return value
}
function optionalString(value, label, max) {
 if (value === undefined || value === null) return undefined
 if (typeof value !== 'string' || value.length > max) throw Error('Invalid ' + label)
 return value
}
function timestamp(value, label) {
 if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw Error('Invalid ' + label)
 return value
}
function validateWorkspace(value) {
 if (!record(value) || !Array.isArray(value.projects) || !Array.isArray(value.pinned)) throw Error('Invalid workspace metadata')
 if (value.projects.length > MAX_PROJECTS || value.pinned.length > 200) throw Error('Workspace metadata exceeds import limits')
 const ids = new Set()
 const projects = value.projects.map(p => {
  if (!record(p)) throw Error('Invalid project')
  const id = requiredString(p.id, 'project ID', 160)
  const name = requiredString(p.name, 'project name', 90)
  if (ids.has(id)) throw Error('Duplicate project ID')
  ids.add(id)
  return normalizeProject({ ...p, id, name, createdAt: timestamp(p.createdAt ?? 0, 'project timestamp') })
 })
 const pinned = value.pinned.map(id => requiredString(id, 'pinned chat ID', 160))
 return {
  projects:normalizeProjects(projects),
  ...cleanProjectNavigation(projects,value.projectOrder,value.pinnedProjects),
  agents:normalizeAgents(value.agents??[],projects),
  preferences:{appearance:['light','dark','system'].includes(value.preferences?.appearance)?value.preferences.appearance:'system'},
  prompts:normalizePrompts(value.prompts??[],[...ids],true),
  pinned: [...new Set(pinned)],
  collapsed: value.collapsed === true,
  expanded: {
   projects: value.expanded?.projects !== false,
   prompts: value.expanded?.prompts !== false,
   pinned: value.expanded?.pinned !== false,
   chats: value.expanded?.chats !== false
  }
 }
}
function validateChats(value) {
 if (!Array.isArray(value) || value.length > BACKUP_MAX_CHATS) throw Error('Backup exceeds the 50-conversation limit')
 const ids = new Set()
 return value.map((c, index) => {
  if (!record(c) || !Array.isArray(c.messages) || c.messages.length > MAX_MESSAGES) throw Error('Invalid conversation at index ' + index)
  const id = requiredString(c.id, 'conversation ID', 160)
  if (ids.has(id)) throw Error('Duplicate conversation ID')
  ids.add(id)
  const title = requiredString(c.title, 'conversation title', 240)
  const projectId = c.projectId == null ? null : requiredString(c.projectId, 'conversation project', 160)
  const contextStart=c.contextStart??0
  if(!Number.isSafeInteger(contextStart)||contextStart<0||contextStart>c.messages.length)throw Error('Invalid conversation context boundary')
  return {
   id, title, projectId, contextStart,
   archived:c.archived===true,
   updatedAt: timestamp(c.updatedAt ?? 0, 'conversation timestamp'),
   messages: c.messages.map(m => {
    if (!record(m) || !['user','assistant'].includes(m.role)) throw Error('Invalid message role')
    const content = optionalString(m.content, 'message content', 200000)
    if (content === undefined) throw Error('Missing message content')
    const out = {id: requiredString(m.id, 'message ID', 160), role: m.role, content}
    if(m.attachments!==undefined)out.attachments=normalizeChatAttachments(m.attachments)
    if (m.provider !== undefined) {
     if (!['plan','api'].includes(m.provider)) throw Error('Invalid message provider')
     out.provider = m.provider
    }
    if (m.model !== undefined) out.model = optionalString(m.model, 'message model', 160)
    if (m.error === true) out.error = true
    return out
   })
  }
 })
}
export function parseWorkspaceBackup(text) {
 if (typeof text !== 'string' || new TextEncoder().encode(text).length > BACKUP_MAX_BYTES) throw Error('Backup file is too large (12 MB maximum)')
 let data
 try { data = JSON.parse(text) } catch { throw Error('Backup is not valid JSON') }
 if (!record(data) || data.kind !== BACKUP_KIND || data.version !== BACKUP_VERSION) throw Error('Unsupported Workspace AI backup format or version')
 const chats = validateChats(data.chats)
 const workspace = validateWorkspace(data.workspace)
 const projectIds = new Set(workspace.projects.map(p => p.id))
 const chatIds = new Set(chats.map(c => c.id))
 return {
  kind: BACKUP_KIND,
  version: BACKUP_VERSION,
  exportedAt: requiredString(data.exportedAt, 'export date', 64),
  chats: chats.map(c => c.projectId!==null&&!projectIds.has(c.projectId)
   ? {...c,projectId:null,contextStart:c.messages.length}:c),
  workspace: {...workspace, pinned: workspace.pinned.filter(id => chatIds.has(id))}
 }
}
export function createWorkspaceBackup(chats, workspace, now = new Date()) {
 // Round-trip through the validator to copy only documented fields.
 return parseWorkspaceBackup(JSON.stringify({
  kind: BACKUP_KIND, version: BACKUP_VERSION, exportedAt: now.toISOString(),
  chats: chats.slice(0, BACKUP_MAX_CHATS),
  workspace
 }))
}
export function prepareWorkspaceRestore(existingChats, existingWorkspace, archive, mode = 'merge') {
 if (mode !== 'merge' && mode !== 'replace') throw Error('Unsupported restore mode')
 // Never trust caller-held objects as if they were freshly validated.
 const imported = parseWorkspaceBackup(JSON.stringify(archive))
 if (mode === 'replace') return {
  chats: imported.chats, workspace: imported.workspace,
  addedChats: imported.chats.length, skippedChats: 0
 }
 const oldChats = Array.isArray(existingChats) ? existingChats.slice(0, BACKUP_MAX_CHATS) : []
 const oldWorkspace = record(existingWorkspace) ? existingWorkspace : {}
 const ids = new Set(oldChats.map(c => c.id))
 const incoming = imported.chats.filter(c => !ids.has(c.id))
 const room = Math.max(0, BACKUP_MAX_CHATS - oldChats.length)
 const added = incoming.slice(0, room)
 const projects = Array.isArray(oldWorkspace.projects) ? oldWorkspace.projects : []
 const projectIds = new Set(projects.map(p => p.id))
 const additions = imported.workspace.projects.filter(p => !projectIds.has(p.id)).map(p => ({...p,shareFilesWith:p.shareFilesWith.filter(id=>!projectIds.has(id))}))
 const mergedProjects = [...projects, ...additions].slice(0, MAX_PROJECTS)
 const newProjectIds = new Set(mergedProjects.filter(p => !projectIds.has(p.id)).map(p => p.id))
 const newChats = [...oldChats, ...added.map(c => ({
  ...c, projectId: newProjectIds.has(c.projectId) ? c.projectId : null,
  contextStart: c.projectId&&!newProjectIds.has(c.projectId)?c.messages.length:c.contextStart
 }))]
 const existingAgents=normalizeAgents(oldWorkspace.agents||[],mergedProjects)
 const knownAgents=new Set(existingAgents.map(a=>a.id))
 const addedAgents=normalizeAgents(imported.workspace.agents||[],mergedProjects).filter(a=>newProjectIds.has(a.projectId)&&!knownAgents.has(a.id))
 const mergedAgents=[...existingAgents,...addedAgents].slice(0,60)
 const existingPrompts=Array.isArray(oldWorkspace.prompts)?oldWorkspace.prompts:[]
 const promptIds=new Set(existingPrompts.map(p=>p.id))
 const additionPrompts=imported.workspace.prompts.filter(p=>!promptIds.has(p.id)&&(!p.projectId||newProjectIds.has(p.projectId)))
 const mergedPrompts=normalizePrompts([...existingPrompts,...additionPrompts].slice(0,100),mergedProjects.map(p=>p.id))
 const chatIds = new Set(newChats.map(c => c.id))
 const pins = [...(Array.isArray(oldWorkspace.pinned) ? oldWorkspace.pinned : []), ...imported.workspace.pinned]
 return {
  chats: newChats,
  workspace: {
   ...oldWorkspace,
   projects: mergedProjects,
   ...cleanProjectNavigation(mergedProjects,[...(oldWorkspace.projectOrder||[]),...(imported.workspace.projectOrder||[])], [...(oldWorkspace.pinnedProjects||[]),...imported.workspace.pinnedProjects.filter(id=>newProjectIds.has(id))]),
   agents: mergedAgents,
   preferences:oldWorkspace.preferences||imported.workspace.preferences,
   prompts: mergedPrompts,
   pinned: [...new Set(pins)].filter(id => chatIds.has(id)).slice(0, 200)
  },
  addedChats: added.length,
  skippedChats: imported.chats.length - added.length
 }
}
// localStorage has no multi-key transaction; restore the original values on a failed write.
export function persistWorkspaceRestore(storage, chatsKey, workspaceKey, restored) {
 const previousChats = storage.getItem(chatsKey)
 const previousWorkspace = storage.getItem(workspaceKey)
 try {
  storage.setItem(chatsKey, JSON.stringify(restored.chats))
  storage.setItem(workspaceKey, JSON.stringify(restored.workspace))
 } catch (error) {
  try {
   if (previousChats === null) storage.removeItem(chatsKey)
   else storage.setItem(chatsKey, previousChats)
   if (previousWorkspace === null) storage.removeItem(workspaceKey)
   else storage.setItem(workspaceKey, previousWorkspace)
  } catch { /* A browser can also reject rollback under storage failure. */ }
  throw Error('Could not save the restored data. Check browser storage space; existing data was preserved where possible.', {cause:error})
 }
}
