import {moveChatToProject} from './chat-project-boundary.js'
import {cleanProjectNavigation} from './project-sidebar.js'

// Project deletion must be one workspace+chat persistence transaction.
// Otherwise failed chat writes can retain old private conversation context
// after the project itself has already been removed.
export function prepareProjectDeletion(chats,workspace,projectId,now=Date.now()){
 if(typeof projectId!=='string'||!projectId||!Array.isArray(chats)||
    !workspace||typeof workspace!=='object'||!Array.isArray(workspace.projects)||
    !workspace.projects.some(p=>p.id===projectId))throw Error('Project was not found')
 return {
  chats:chats.map(chat=>chat.projectId===projectId?moveChatToProject(chat,null,now):chat),
  workspace:{
   ...workspace,
   ...cleanProjectNavigation(workspace.projects.filter(p=>p.id!==projectId),workspace.projectOrder,workspace.pinnedProjects),
   projects:workspace.projects.filter(p=>p.id!==projectId).map(p=>({
    ...p,shareFilesWith:(p.shareFilesWith||[]).filter(id=>id!==projectId)
   })),
   prompts:(workspace.prompts||[]).filter(p=>p.projectId!==projectId),
   agents:(workspace.agents||[]).filter(agent=>agent.projectId!==projectId)
  }
 }
}
