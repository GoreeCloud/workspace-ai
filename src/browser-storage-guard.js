// Best-effort stale-tab protection for browser-local data.
// localStorage provides atomic individual writes but no compare-and-swap transaction:
// an overlapping write between verify and setItem is still possible.
export class BrowserStorageConflict extends Error {
 constructor() {
  super('Another tab changed Workspace AI data. This tab is now read-only to prevent overwriting it. Reload to view the latest changes.')
  this.name='BrowserStorageConflict'
 }
}
export function createBrowserStorageGuard(storage,keys) {
 if(!Array.isArray(keys)||keys.length===0||new Set(keys).size!==keys.length)
  throw Error('Invalid browser storage keys')
 const snapshots=new Map(keys.map(key=>[key,storage.getItem(key)]))
 let blocked=false
 const check=()=>{
  if(blocked)throw new BrowserStorageConflict()
  for(const [key,value] of snapshots) {
   if(storage.getItem(key)!==value) {
    blocked=true
    throw new BrowserStorageConflict()
   }
  }
 }
 const watch=key=>{
  if(key!==null&&!snapshots.has(key))return false
  try {check();return false}
  catch(error) {
   if(error instanceof BrowserStorageConflict)return true
   throw error
  }
 }
 const write=(key,serialized)=>{
  if(!snapshots.has(key))throw Error('Unknown browser storage key')
  check()
  storage.setItem(key,serialized)
  snapshots.set(key,serialized)
 }
 const restore=action=>{
  check()
  try{
   const result=action()
   for(const key of snapshots.keys())snapshots.set(key,storage.getItem(key))
   return result
  }catch(error){
   // A failed multi-key restore may not have rolled back completely.
   // Refuse subsequent writes until the application is reloaded in that case.
   check()
   throw error
  }
 }
 return {check,watch,write,restore}
}

export function browserStorageLoadProblem(storage,chatsKey,workspaceKey) {
 try {
  const chats=storage.getItem(chatsKey)
  if(chats!==null&&!Array.isArray(JSON.parse(chats)))throw Error('Invalid saved conversations')
  const workspace=storage.getItem(workspaceKey)
  if(workspace!==null) {
   const value=JSON.parse(workspace)
   if(!value||typeof value!=='object'||Array.isArray(value)||
    !Array.isArray(value.projects)||!Array.isArray(value.pinned))throw Error('Invalid saved workspace')
  }
  return null
 }catch {
  return 'Saved Workspace AI browser data is unreadable or malformed. This tab is read-only so the original stored data is not overwritten. Preserve or repair it before reloading.'
 }
}
