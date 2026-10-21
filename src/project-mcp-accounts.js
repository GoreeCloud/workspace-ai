// Project-specific MCP account bindings are *configuration*, not credentials or access grants.
// Connections must be verified and permissions re-checked by the server before tool execution.
export const MAX_MCP_ACCOUNTS=24
export const MAX_RESOURCE_SCOPES=32
const string=(v,n)=>typeof v==='string'?v.trim().slice(0,n):''
const id=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,160}$/.test(v)
const provider=v=>typeof v==='string'&&/^[a-z][a-z0-9._-]{1,79}$/.test(v)
const unique=a=>[...new Set(a)]
export function normalizeResourcePath(value){
 if(typeof value!=='string'||value.length>1024||!value.startsWith('/'))throw Error('Resource scope must be an absolute path')
 const segments=value.split('/').slice(1)
 if(segments.some(part=>part==='.'||part==='..'||part.includes('\\')||part.includes('\0')||/%2f|%5c|%2e/i.test(part)))throw Error('Unsafe resource scope')
 return '/'+segments.filter(Boolean).join('/')
}
export function normalizeMcpAccounts(value){
 if(value==null)return []
 if(!Array.isArray(value)||value.length>MAX_MCP_ACCOUNTS)throw Error('Invalid MCP account list')
 const ids=new Set()
 return value.map(item=>{
  if(!item||typeof item!=='object'||Array.isArray(item)||!id(item.id)||!provider(item.provider))throw Error('Invalid MCP account identity')
  if(ids.has(item.id))throw Error('Duplicate MCP account')
  ids.add(item.id)
  if(item.connectionId!==undefined&&item.connectionId!==''&&!id(item.connectionId))throw Error('Invalid MCP connection reference')
  const accountLabel=string(item.accountLabel,120)
  if(!accountLabel)throw Error('MCP account label is required')
  const roots=item.resourceRoots??[]
  if(!Array.isArray(roots)||roots.length>MAX_RESOURCE_SCOPES)throw Error('Too many MCP resource scopes')
  const tools=item.tools??[]
  if(!Array.isArray(tools)||tools.length>120||tools.some(x=>typeof x!=='string'||x.length>120||!/^[a-zA-Z0-9._/-]+$/.test(x)))throw Error('Invalid MCP tool list')
  return {
   id:item.id,provider:item.provider,accountLabel,
   connectionId:item.connectionId||'',
   enabled:item.enabled===true,
   read:item.read===true,write:item.write===true,
   resourceRoots:unique(roots.map(normalizeResourcePath)),
   tools:unique(tools)
  }
 })
}
export function authorizeProjectMcpAccount({project,accountId,provider,mode='read',resourcePath,toolName,verifiedConnectionIds=[]}={}){
 const accounts=normalizeMcpAccounts(project?.mcpAccounts)
 const account=accounts.find(v=>v.id===accountId&&v.provider===provider)
 const deny=reason=>({allowed:false,reason})
 if(!account)return deny('Account is not configured for this project')
 if(!account.enabled)return deny('Account is disabled for this project')
 if(mode!=='read'&&mode!=='write')return deny('Unknown access mode')
 if(!account[mode])return deny('Project account permission disabled')
 if(!account.connectionId||!verifiedConnectionIds.includes(account.connectionId))return deny('Server-verified account connection required')
 if(typeof toolName!=='string'||!account.tools.includes(toolName))return deny('Tool not approved for this project account')
 if(typeof resourcePath!=='string')return deny('Resource scope required')
 let path
 try{path=normalizeResourcePath(resourcePath)}catch{return deny('Invalid resource path')}
 if(!account.resourceRoots.some(root=>path===root||root==='/'||path.startsWith(root+'/')))return deny('Resource outside project account scope')
 return {allowed:true,reason:'Profile preflight passed; server tool policy and provider scope must also approve',accountId:account.id,connectionId:account.connectionId}
}
