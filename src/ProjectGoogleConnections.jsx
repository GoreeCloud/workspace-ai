import React,{useEffect,useState} from 'react'

import {useState,useEffect} from 'react'
// Standalone local Google OAuth. Tokens remain server-side, never in browser storage.
export default function ProjectGoogleConnections({project}){
 const [config,setConfig]=useState({configured:false,services:{}})
 const [busy,setBusy]=useState('')
 const [error,setError]=useState('')
 const [query,setQuery]=useState('')
 const [results,setResults]=useState(null)
 const [files,setFiles]=useState([])
 const [filePreview,setFilePreview]=useState(null)
 const enabled=new Set(project?.api||[])
 const refresh=async()=>{
  const response=await fetch('/api/google/status',{method:'GET'})
  if(!response.ok)throw Error('Google service status unavailable.')
  const data=await response.json()
  setConfig(data)
 }
 useEffect(()=>{setResults(null);setFiles([]);setFilePreview(null);refresh().catch(()=>{})},[project?.id])
 const call=async(path,body)=>{
  const res=await fetch('/api/google/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
  const data=await res.json()
  if(!res.ok)throw Error(data.error||'Google integration request denied.')
  return data
 }
 const run=async(id,task)=>{
  setBusy(id);setError('')
  try{await task()}catch(e){setError(e.message||'Google integration unavailable.')}
  finally{setBusy('')}
 }
 const connect=service=>run(service,async()=>{
  const data=await call('start',{service})
  const url=new URL(data.url)
  if(url.origin!=='https://accounts.google.com')throw Error('Unexpected Google authorization destination.')
  window.location.assign(url.toString())
 })
 const disconnect=service=>run('disconnect-'+service,async()=>{
  await call('disconnect',{service});await refresh()
  setFiles([]);setResults(null);setFilePreview(null)
 })
 const gmailReady=enabled.has('gmail')&&config.services?.gmail?.connected
 const driveReady=enabled.has('google-drive')&&config.services?.['google-drive']?.connected
 const search=()=>run('search',async()=>{
  const data=await call('gmail/search',{q:query})
  if(data.readOnly!==true||!Array.isArray(data.messages))throw Error('Unexpected Gmail response.')
  setResults(data.messages)
 })
 const list=()=>run('drive',async()=>{
  const res=await fetch('/api/google/drive/list')
  const data=await res.json()
  if(!res.ok)throw Error(data.error||'Drive list unavailable.')
  if(data.readOnly!==true||!Array.isArray(data.files))throw Error('Unexpected Drive list response.')
  setFiles(data.files);setFilePreview(null)
 })
 const preview=id=>run('read-'+id,async()=>{
  const data=await call('drive/read',{id})
  if(data.readOnly!==true||typeof data.content!=='string')throw Error('Unexpected Drive content response.')
  setFilePreview({name:data.name,content:data.content.slice(0,16000)})
 })
 return <section className="projectGoogleConnections" aria-label="Google Workspace read-only connections">
  <h4>Google Workspace — standalone, read-only</h4>
  <p className="projectHint">Google authorization is separate from ChatGPT connectors. Workspace AI verifies the GoreeCloud Google account, keeps short-lived access tokens in its local server memory only, and never enables Gmail or Drive writes here.</p>
  {!config.configured&&<p className="projectHint">Not configured: the local Workspace AI server requires a registered Google OAuth web client ID and secret. Google scopes and verification must be approved before use.</p>}
  {['gmail','google-drive'].map(service=>{
   const selected=enabled.has(service),connected=config.services?.[service]?.connected
   const label=service==='gmail'?'Gmail search':'Drive app-authorized files'
   return <div key={service} className="projectGoogleService">
    <strong>{label}</strong>
    <small>{!selected?'Enable in this Project’s API integrations':connected?'Locally connected':'Not connected to this standalone app'}</small>
    <div className="actions">
     <button type="button" className="outline" disabled={!selected||!config.configured||!!busy||connected} onClick={()=>connect(service)}>Connect</button>
     <button type="button" className="outline" disabled={!connected||!!busy} onClick={()=>disconnect(service)}>Disconnect local session</button>
    </div>
   </div>
  })}
  <div className="projectGoogleService">
   <label>Gmail search query<input value={query} maxLength={300} placeholder="subject:release is:unread" onChange={e=>setQuery(e.target.value)}/></label>
   <button type="button" className="outline" disabled={!gmailReady||!query.trim()||!!busy} onClick={search}>Search Gmail (read only)</button>
   {results&&<ul>{results.map(x=><li key={x.id}><strong>{x.subject||'(No subject)'}</strong><small>{x.from}</small><p>{x.snippet}</p></li>)}</ul>}
  </div>
  <div className="projectGoogleService">
   <p className="projectHint">The narrow <code>drive.file</code> scope shows only files already authorized for this app, not your entire Drive. Existing files will need a separate Google Picker integration before they can be selected.</p>
   <button type="button" className="outline" disabled={!driveReady||!!busy} onClick={list}>List app-authorized Drive files</button>
   {!!files.length&&<ul>{files.map(file=><li key={file.id}><strong>{file.name}</strong><button type="button" className="outline" disabled={!!busy} onClick={()=>preview(file.id)}>Preview text</button></li>)}</ul>}
   {filePreview&&<details open><summary>{filePreview.name} — local read-only preview</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxHeight:330,overflow:'auto'}}>{filePreview.content}</pre></details>}
  </div>
  {error&&<p className="projectAlert" role="alert">{error}</p>}
 </section>
}
