// A browser's local workspace is not automatically the workspace of whichever
// account signs in next. The owner must explicitly consent to uploading its data.
export const LOCAL_SYNC_OWNER_KEY='workspace-ai-synced-account-v1'
export function accountImportPlan({accountId,previousAccountId=null,chats=[],workspace={}}={}){
 if(typeof accountId!=='string'||!/^[0-9a-f]{24}$/.test(accountId))throw Error('Verified account identity required')
 const projectCount=Array.isArray(workspace.projects)?workspace.projects.length:0
 const chatCount=Array.isArray(chats)?chats.length:0
 const agentCount=Array.isArray(workspace.agents)?workspace.agents.length:0
 const promptCount=Array.isArray(workspace.prompts)?workspace.prompts.length:0
 const hasData=projectCount+chatCount+agentCount+promptCount>0
 const differentAccount=Boolean(previousAccountId&&previousAccountId!==accountId)
 return {hasData,differentAccount,requiresConfirmation:hasData,
  message:differentAccount?
  'This device previously synchronized a workspace with another account. Uploading now would copy its existing projects, memories, chats and agent configurations into the newly signed-in account. Only continue if this intentional cross-account transfer is authorized.' :
  'This account has no remote workspace yet. Upload the projects, memories, chats, agents and prompts currently stored in this browser to this signed-in account? The remote account will receive an encrypted copy.'}
}
