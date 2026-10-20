import React,{useCallback,useEffect,useRef,useState} from 'react'

import {FolderOpen,FilePlus2,RefreshCw,Unlink2} from 'lucide-react'
import {useState,useEffect,useRef,useCallback} from 'react'
import ProjectDriveLinks from './ProjectDriveLinks.jsx'
import {MAX_LINKED_SOURCES,REFRESH_INTERVAL_MS,scanSource,replaceLinkedSnapshot,savedHandle,fetchDropboxSnapshot,fetchDropboxFolderSnapshot,fetchDriveFileSnapshot} from './project-linked-source.js'

// Browser-selected File System Access handles; refresh is READ ONLY and only while the UI is open.
export default function ProjectLiveSources({project,onUpdate,busy=false}){
 const [states,setStates]=useState({})
 const [working,setWorking]=useState('')
 const [notice,setNotice]=useState('')
 const [error,setError]=useState('')
 const [dropboxPath,setDropboxPath]=useState('')
 const projectRef=useRef(project),updateRef=useRef(onUpdate),active=useRef(false)
 projectRef.current=project;updateRef.current=onUpdate
 const connected=Array.isArray(project.linkedSources)?project.linkedSources:[]
 const report=(id,value)=>setStates(s=>({...s,[id]:value}))
 const syncOne=useCallback(async(source)=>{
  let snapshot
  if(source.kind==='dropbox-file')snapshot=await fetchDropboxSnapshot(source)
  else if(source.kind==='dropbox-directory')snapshot=await fetchDropboxFolderSnapshot(source)
  else if(source.kind==='google-drive-file')snapshot=await fetchDriveFileSnapshot(source)
  else{
   const handle=await savedHandle('get',source.id)
   if(!handle){report(source.id,'Reconnect required');return}
   snapshot=await scanSource(handle,source)
  }
  // Functional patch avoids overwriting another source's concurrent scan or user edits.
  updateRef.current(current=>{
   if(!(current.linkedSources||[]).some(s=>s.id===source.id))return {}
   return {files:replaceLinkedSnapshot(current.files,source.id,snapshot)}
  })
  report(source.id,'Synced '+new Date().toLocaleTimeString())
 },[])
 const syncAll=useCallback(async()=>{
  if(active.current||document.visibilityState==='hidden')return
  active.current=true
  try{
   for(const source of projectRef.current.linkedSources||[]){
    try{await syncOne(source)}catch(e){report(source.id,'Refresh failed: '+(e.message||'Permission unavailable'))}
   }
  }finally{active.current=false}
 },[syncOne])
 useEffect(()=>{
  const timer=setInterval(()=>{void syncAll()},REFRESH_INTERVAL_MS)
  const onVisible=()=>{if(document.visibilityState==='visible')void syncAll()}
  document.addEventListener('visibilitychange',onVisible)
  void syncAll()
  return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',onVisible)}
 },[project.id,syncAll])
 const pick=async(kind)=>{
  if(kind==='file'){
   if(typeof window.showOpenFilePicker!=='function')throw Error('This browser does not support linked local files. Import a snapshot instead.')
   const results=await window.showOpenFilePicker({multiple:false});return results[0]
  }
  if(typeof window.showDirectoryPicker!=='function')throw Error('This browser does not support linked folders. Import a snapshot instead.')
  return window.showDirectoryPicker({mode:'read'})
 }
 const link=async(kind,existing=null)=>{
  if(busy||working)return
  setError('');setNotice('');setWorking(existing?.id||kind)
  try{
   if(!existing&&connected.length>=MAX_LINKED_SOURCES)throw Error('Each project supports at most five linked sources.')
   const handle=await pick(kind)
   if(!handle)return
   const permission=typeof handle.queryPermission==='function'?await handle.queryPermission({mode:'read'}):'denied'
   if(permission!=='granted'){
    if(typeof handle.requestPermission!=='function'||await handle.requestPermission({mode:'read'})!=='granted')
     throw Error('Read permission was not granted.')
   }
   const id=existing?.id||crypto.randomUUID()
   const source={id,kind,name:String(handle.name).slice(0,100),linkedAt:Date.now()}
   const items=await scanSource(handle,source)
   replaceLinkedSnapshot(projectRef.current.files,source.id,items)
   await savedHandle('put',id,handle)
   updateRef.current(p=>({
    files:replaceLinkedSnapshot(p.files,source.id,items),
    linkedSources:existing?(p.linkedSources||[]).map(s=>s.id===id?source:s):[...(p.linkedSources||[]),source]
   }))
   report(id,'Synced '+new Date().toLocaleTimeString())
   setNotice((existing?'Reconnected':'Linked')+' '+source.name+'. Changes are checked while Workspace AI is open.')
  }catch(e){if(e.name!=='AbortError')setError(e.message||'Could not link source.')}
  finally{setWorking('')}
 }
 const linkDropbox=async(path,existing=null,kind='dropbox-file')=>{
  if(busy||working)return
  setError('');setNotice('');setWorking('dropbox')
  try{
   if(!existing&&connected.length>=MAX_LINKED_SOURCES)throw Error('Each project supports at most five linked sources.')
   const location=String(path||'').trim()
   if(!location.startsWith('/')||location.length>1024)throw Error('Enter an absolute Dropbox file path.')
   const name=location.split('/').pop().slice(0,100)
   const source={id:existing?.id||crypto.randomUUID(),kind,name,path:location,linkedAt:Date.now()}
   const items=kind==='dropbox-directory'?await fetchDropboxFolderSnapshot(source):await fetchDropboxSnapshot(source)
   replaceLinkedSnapshot(projectRef.current.files,source.id,items)
   updateRef.current(p=>({
    files:replaceLinkedSnapshot(p.files,source.id,items),
    linkedSources:existing?(p.linkedSources||[]).map(s=>s.id===source.id?source:s):[...(p.linkedSources||[]),source]
   }))
   report(source.id,'Synced '+new Date().toLocaleTimeString())
   setDropboxPath('')
   setNotice('Linked Dropbox '+(kind==='dropbox-directory'?'folder':'file')+' '+source.name+'. Refreshes while this page is open.')
  }catch(e){setError(e.message||'Dropbox file could not be linked.')}
  finally{setWorking('')}
 }
 const unlink=async(source)=>{
  setError('');setWorking(source.id)
  try{
   updateRef.current(p=>({files:(p.files||[]).filter(f=>f.linkId!==source.id),
    linkedSources:(p.linkedSources||[]).filter(s=>s.id!==source.id)}))
   if(!source.kind.startsWith('dropbox-')&&source.kind!=='google-drive-file')await savedHandle('delete',source.id)
   report(source.id,'Unlinked')
  }catch(e){setError('Source unlink failed: '+(e.message||'Unknown error'))}
  finally{setWorking('')}
 }
 return <section className="projectLiveSources" aria-label="Live local files and folders">
  <h4>Live files & folders <small>read-only</small></h4>
  <p className="projectHint">Link a file or a directory from this device. While this page is open, Workspace AI checks for changes about once a minute and updates your project's reference text. The original files are never modified. Your browser must support the File System Access API and retain read permission.</p>
  <div className="actions">
   <button type="button" className="outline" disabled={busy||!!working||connected.length>=MAX_LINKED_SOURCES} onClick={()=>link('file')}><FilePlus2 size={15}/> Link file</button>
   <button type="button" className="outline" disabled={busy||!!working||connected.length>=MAX_LINKED_SOURCES} onClick={()=>link('directory')}><FolderOpen size={15}/> Link folder</button>
   <button type="button" className="outline" disabled={busy||!!working||!connected.length} onClick={()=>syncAll()}><RefreshCw size={15}/> Refresh now</button>
  </div>
  <label htmlFor="linked-dropbox-path">Link an already-connected Dropbox text file</label>
  <div className="projectCloudRow">
   <input id="linked-dropbox-path" placeholder="/Documents/notes.md" value={dropboxPath} maxLength={1024} onChange={e=>setDropboxPath(e.target.value)}/>
   <button type="button" className="outline" disabled={busy||!!working||connected.length>=MAX_LINKED_SOURCES||!dropboxPath.trim()} onClick={()=>linkDropbox(dropboxPath)}>Link Dropbox file</button>
   <button type="button" className="outline" disabled={busy||!!working||connected.length>=MAX_LINKED_SOURCES||!dropboxPath.trim()} onClick={()=>linkDropbox(dropboxPath,null,'dropbox-directory')}>Link Dropbox folder</button>
  </div>
  <ProjectDriveLinks key={project.id} project={project} onUpdate={onUpdate} busy={busy||!!working}/>
  {!!connected.length&&<ul className="projectLinkedList">{connected.map(s=><li key={s.id}>
   <strong>{s.name}</strong> <small>{s.kind} · {states[s.id]||'Awaiting refresh'}</small>
   <div className="actions">
    <button type="button" className="outline" disabled={busy||!!working} onClick={()=>s.kind==='google-drive-file'?syncOne(s):s.kind.startsWith('dropbox-')?linkDropbox(s.path,s,s.kind):link(s.kind,s)}>Reconnect</button>
    <button type="button" className="outline" disabled={busy||!!working} onClick={()=>unlink(s)}><Unlink2 size={14}/> Unlink</button>
   </div></li>)}</ul>}
  {notice&&<p role="status" className="projectHint">{notice}</p>}
  {error&&<p role="alert" className="projectAlert">{error}</p>}
  <p className="projectHint">Browser handle permissions are stored locally in IndexedDB, not in project backups. Backups contain the latest text snapshots; restored sources may need reconnection. Automatic checks pause when the page is hidden or closed.</p>
 </section>
}
