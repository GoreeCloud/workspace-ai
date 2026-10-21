import {useEffect,useRef,useState} from 'react'
import {createWorkspaceBackup,parseWorkspaceBackup} from './workspace-backup.js'
import {encryptAccountSnapshot,decryptAccountSnapshot} from './account-sync-crypto.js'
async function call(path,body){
 const r=await fetch(path,body?{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{method:'GET'})
 const value=await r.json()
 if(!r.ok)throw Object.assign(Error(value.error||'Account sync unavailable'),{status:r.status})
 return value
}
export function useAccountSync({chats,workspace,preferences={},busy=false,onRestore}){
 const [available,setAvailable]=useState(false),[identity,setIdentity]=useState(null),[state,setState]=useState('local'),[message,setMessage]=useState('')
 const [revision,setRevision]=useState(null),[passphrase,setPassphrase]=useState('')
 const revisionRef=useRef(null),sequence=useRef(Promise.resolve()),mounted=useRef(true)
 const enabled=state==='enabled'
 const locked=useRef(false)
 const remoteRef=useRef(null)
 const active=useRef(false)
 const disabledRef=useRef(false)
 const snapshot=()=>createWorkspaceBackup(chats,workspace)
 const syncPrefs=()=>({appearance:['light','dark','system'].includes(preferences.appearance)?preferences.appearance:'system'})
 const refresh=async()=>{
  try{
   const status=await call('/api/sync/status')
   setAvailable(status.available===true);setIdentity(status.authenticated?{email:status.email||'Signed-in account',accountId:status.accountId}:null)
   if(!status.available||!status.authenticated){
    active.current=false;disabledRef.current=true;setState('local');setPassphrase('');setRevision(null);revisionRef.current=null
   }
   return status
  }catch(e){setMessage(e.message);setAvailable(false);return null}
 }
 useEffect(()=>{mounted.current=true;refresh();return()=>{mounted.current=false}},[])
 const send=async(session,expected)=>{
  const envelope=await encryptAccountSnapshot({...snapshot(),preferences:syncPrefs()},session)
  const response=await call('/api/sync/snapshot',{envelope,expectedRevision:expected})
  revisionRef.current=response.revision;setRevision(response.revision);setMessage('Encrypted workspace synchronized.')
  return response
 }
 const enable=async secret=>{
  if(locked.current)return
  locked.current=true;setMessage('')
  try{
   const status=await refresh()
   if(!status?.available||!status?.authenticated)throw Error('Account sync requires a signed-in account and configured shared server')
   const remote=await call('/api/sync/snapshot')
   if(remote.envelope){
    const payload=await decryptAccountSnapshot(remote.envelope,secret)
    const archived=parseWorkspaceBackup(JSON.stringify(payload))
    remoteRef.current={archive:archived,preferences:payload.preferences||{},revision:remote.revision}
    setState('restore-required');setMessage('Encrypted account data found. Review and restore it before enabling automatic sync. Nothing was overwritten.')
    setPassphrase(secret)
   }else{
    await send(secret,null)
    active.current=true;disabledRef.current=false;setPassphrase(secret);setState('enabled')
   }
  }catch(e){setMessage(e.message);setState('local')}
  finally{locked.current=false}
 }
 const restore=async()=>{
  if(locked.current||!remoteRef.current)return null
  if(!window.confirm('Replace the local workspace with the saved account snapshot? Download a local backup first. Existing local projects and chats will be overwritten.'))return null
  locked.current=true
  try{
   const source=remoteRef.current
   onRestore(source.archive,'replace',source.preferences)
   revisionRef.current=source.revision;setRevision(source.revision);remoteRef.current=null
   active.current=true;disabledRef.current=false;setState('enabled');setMessage('Account data restored and automatic sync enabled.')
   return true
  }catch(e){setMessage(e.message);return null}
  finally{locked.current=false}
 }
 const keepLocal=()=>{active.current=false;disabledRef.current=true;remoteRef.current=null;setPassphrase('');setRevision(null);revisionRef.current=null;setState('local');setMessage('Local-only mode. This device will not upload or restore account data.')}
 useEffect(()=>{
  if(!enabled||!active.current||disabledRef.current||busy)return
  const handle=setTimeout(async()=>{
   if(locked.current)return
   locked.current=true
   try{await send(passphrase,revisionRef.current)}
   catch(e){
    active.current=false;disabledRef.current=true;setState('conflict');setMessage(e.status===409?
     'Another device updated this account. Automatic sync stopped to prevent overwriting it. Export a local backup and reload the latest account snapshot.':e.message)
   }finally{locked.current=false}
  },3500)
  return()=>clearTimeout(handle)
 },[chats,workspace,preferences.appearance,enabled,passphrase,busy])
 return {available,identity,state,message,revision,enable,restore,keepLocal,refresh}
}
