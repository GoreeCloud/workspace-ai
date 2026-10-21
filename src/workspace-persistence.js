// Commit browser-local workspace changes before acknowledging them in the UI.
export function persistWorkspaceChange(storage,key,current,change) {
 const next=typeof change==='function'?change(current):change
 if(!next||typeof next!=='object'||Array.isArray(next))throw Error('Invalid workspace update')
 storage.setItem(key,JSON.stringify(next)) // Throws on quota/security failures; state stays unchanged.
 return next
}
