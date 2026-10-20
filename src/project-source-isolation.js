// Reject the result of an asynchronous linked-source read after a project switch,
// unlink, or replacement with a different provider path/file.
export function canApplyLinkedRefresh(activeProjectId,startedProjectId,project,source){
 if(activeProjectId!==startedProjectId||project?.id!==startedProjectId||!source?.id)return false
 return Array.isArray(project.linkedSources)&&project.linkedSources.some(item=>
  item.id===source.id&&item.kind===source.kind&&item.name===source.name&&
  (item.linkedAt??null)===(source.linkedAt??null)&&
  (item.path??null)===(source.path??null)&&
  (item.fileId??null)===(source.fileId??null))
}
