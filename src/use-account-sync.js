import {useEffect,useRef,useState} from 'react'
import {createWorkspaceBackup,parseWorkspaceBackup} from './workspace-backup.js'
import {encryptAccountSnapshot,decryptAccountSnapshot} from './account-sync-crypto.js'
import {accountImportPlan,LOCAL_SYNC_OWNER_KEY} from './account-sync-consent.js'
import {accountScopedKey} from './account-workspace-scope.js'
async function call(path,body,accountId){
 const r=await fetch(path,body?{method:'PUT',headers:{'Content-Type':'application/json',...(accountId?{'X-Workspace-Account-Id':accountId}:{})},body:JSON.stringify(body)}:{method:'GET',headers:accountId?{'X-Workspace-Account-Id':accountId}:{}})
 const value=await r.json()
 if(!r.ok)throw Object.assign(Error(value.error||'Account sync unavailable'),{status:r.status})
 return value
}
export function useAccountSync({chats,workspace,preferences={},busy=false,onRestore}){
 const [available,setAvailable]=useState(false),[identity,setIdentity]=useState(null),[state,setState]=useState('local'),[message,setMessage]=useState('')
 const [revision,setRevision]=useState(null),[passphrase,setPassphrase]=useState('')
 const [reauthorizeRequired,setReauthorizeRequired]=useState(false)
 const revisionRef=useRef(null)
 const lastSyncedRef=useRef(null),skipRestoreUpload=useRef(false)
 const [syncTick,setSyncTick]=useState(0)
 const enabled=state==='enabled'
 const locked=useRef(false)
 const remoteRef=useRef(null)
 const activeAccountRef=useRef(null)
 const mismatchRef=useRef(false)
 const active=useRef(false)
 const disabledRef=useRef(false)
 const snapshot=()=>createWorkspaceBackup(chats,workspace)
 const syncPrefs=()=>({appearance:['light','dark','system'].includes(preferences.appearance)?preferences.appearance:'system'})
 const currentPayload=()=>({...snapshot(),preferences:syncPrefs()})
 const savedAccountId=()=>{
  try{return localStorage.getItem(accountScopedKey(LOCAL_SYNC_OWNER_KEY))}catch{return null}
 }
 const markOwner=accountId=>{
  try{localStorage.setItem(accountScopedKey(LOCAL_SYNC_OWNER_KEY),accountId)}
  catch{setMessage('Sync succeeded, but the browser could not remember this account binding. Keep a separate backup.')}
 }
 const refresh=async()=>{
  try{
   const status=await call('/api/sync/status')
   if(activeAccountRef.current&&status.accountId!==activeAccountRef.current){
    mismatchRef.current=true;active.current=false;disabledRef.current=true;setState('conflict');setMessage('The logged-in account changed. Sync stopped to protect project privacy.');throw Error('Sync requires the original signed-in account. Choose local-only mode first to switch accounts.')
   }
   setReauthorizeRequired(status.reauthorizeRequired===true)
   if(status.authenticated)activeAccountRef.current=status.accountId
   setAvailable(status.available===true);setIdentity(status.authenticated?{email:status.email||'Signed-in account',accountId:status.accountId}:null)
   if(!status.available||!status.authenticated){
    active.current=false;disabledRef.current=true;setState('local');setPassphrase('');setRevision(null);revisionRef.current=null
   }
   return status
  }catch(e){setMessage(e.message);return null}
 }
 useEffect(()=>{refresh()},[])
 const send=async(session,expected,payload=currentPayload())=>{
  const fingerprint=JSON.stringify(payload)
  const envelope=await encryptAccountSnapshot(payload,session)
  const response=await call('/api/sync/snapshot',{envelope,expectedRevision:expected},activeAccountRef.current)
  if(!response?.revision||response.conflict)throw Error('Encrypted snapshot was not confirmed by the server')
  lastSyncedRef.current=fingerprint
  revisionRef.current=response.revision;setRevision(response.revision);setMessage('Encrypted workspace synchronized.')
  return response
 }
 const enable=async secret=>{
  if(locked.current)return
  locked.current=true;setMessage('')
  try{
   const status=await refresh()
   if(!status?.available||!status?.authenticated)throw Error('Account sync requires a signed-in account and configured shared server')
   const remote=await call('/api/sync/snapshot',undefined,status.accountId)
   if(remote.envelope){
    const payload=await decryptAccountSnapshot(remote.envelope,secret)
    const archived=parseWorkspaceBackup(JSON.stringify(payload))
    remoteRef.current={archive:archived,preferences:payload.preferences||{},revision:remote.revision}
    setState('restore-required');setMessage('Encrypted account data found. Review and restore it before enabling automatic sync. Nothing was overwritten.')
    setPassphrase(secret)
   }else{
    const plan=accountImportPlan({accountId:status.accountId,previousAccountId:savedAccountId(),chats,workspace})
    if(plan.requiresConfirmation&&!window.confirm(plan.message+'\n\nThis action cannot be undone by simply switching back to local-only mode.'))return
    await send(secret,null)
    markOwner(status.accountId)
    active.current=true;disabledRef.current=false;setPassphrase(secret);setState('enabled')
   }
  }catch(e){setMessage(e.message);if(!mismatchRef.current)setState('local')}
  finally{locked.current=false}
 }
 const restore=async()=>{
  if(locked.current||!remoteRef.current)return null
  if(!window.confirm('Replace the local workspace with the saved account snapshot? Download a local backup first. Existing local projects and chats will be overwritten.'))return null
  locked.current=true
  try{
   const source=remoteRef.current
   const verified=await refresh()
   if(!verified?.available||!verified.authenticated||verified.accountId!==activeAccountRef.current)
    throw Error('The account changed or became unavailable. Local data was not replaced.')
   const latest=await call('/api/sync/snapshot',undefined,activeAccountRef.current)
   if(latest.revision!==source.revision)throw Error('Account data changed on another device. Unlock the latest snapshot before restoring.')
   onRestore(source.archive,'replace',source.preferences)
   revisionRef.current=source.revision;setRevision(source.revision);remoteRef.current=null
   // Restoring an existing snapshot must never immediately re-upload stale pre-restore state.
   skipRestoreUpload.current=true
   markOwner(activeAccountRef.current)
   active.current=true;disabledRef.current=false;setState('enabled');setMessage('Account data restored. Future edits will synchronize.')
   return true
  }catch(e){setMessage(e.message);return null}
  finally{locked.current=false}
 }
 const keepLocal=()=>{active.current=false;disabledRef.current=true;remoteRef.current=null;activeAccountRef.current=null;mismatchRef.current=false;lastSyncedRef.current=null;skipRestoreUpload.current=false;setPassphrase('');setRevision(null);revisionRef.current=null;setState('local');setMessage('Local-only mode. This device will not upload or restore account data.')}
 useEffect(()=>{
  if(!enabled||!active.current||disabledRef.current||busy)return
  const payload=currentPayload(),fingerprint=JSON.stringify(payload)
  if(skipRestoreUpload.current){
   skipRestoreUpload.current=false
   lastSyncedRef.current=fingerprint
   return
  }
  if(fingerprint===lastSyncedRef.current||locked.current)return
  const handle=setTimeout(async()=>{
   if(locked.current||!active.current||disabledRef.current)return
   locked.current=true
   try{await send(passphrase,revisionRef.current,payload)}
   catch(e){
    active.current=false;disabledRef.current=true;setState('conflict');setMessage(e.status===409?
     'Another device updated this account, or your sign-in changed. Automatic sync stopped. Export a local backup and unlock the latest account snapshot.':e.message)
   }finally{locked.current=false;setSyncTick(t=>t+1)}
  },3500)
  return()=>clearTimeout(handle)
 },[chats,workspace,preferences.appearance,enabled,passphrase,busy,syncTick])
 return {available,identity,state,message,revision,reauthorizeRequired,enable,restore,keepLocal,refresh}
}
