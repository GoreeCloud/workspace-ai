export const AVATAR_STORAGE_NAME='workspace-ai-profile-avatar-v1'
export function profileIdentity(status){
 const text=[status?.displayName,status?.username,status?.email].find(value=>typeof value==='string'&&value.trim())
 const label=(text||'Local guest').trim().slice(0,90)
 const initials=label.split(/\s+/).map(part=>part.charAt(0)).join('').slice(0,2).toUpperCase()||'G'
 return {label,initials,guest:status?.connected!==true,email:typeof status?.email==='string'?status.email:null}
}
export function validAvatarDataUrl(value){return typeof value==='string'&&value.length<=100000&&/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)}
