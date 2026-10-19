import './dropbox-reader.css'
import React, {useEffect,useRef,useState} from 'react'
import {Folder,File,ArrowLeft,RefreshCw,Cloud} from 'lucide-react'

// Read-only folder metadata; no file transfers or changes.
export default function DropboxBrowser(){
 const [folder,setFolder]=useState(''),[history,setHistory]=useState([]),[entries,setEntries]=useState([]),
       [cursor,setCursor]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const sequence=useRef(0)
 const load=async(path='',page=null)=>{
  const request=++sequence.current;setBusy(true);setError('')
  try{
   const query=new URLSearchParams({path});if(page)query.set('cursor',page)
   const response=await fetch('/api/integrations/dropbox/data?'+query)
   const result=await response.json()
   if(!response.ok)throw Error(result.error||'Dropbox unavailable.')
   if(request!==sequence.current)return
   setEntries(old=>page?[...old,...result.entries]:result.entries)
   setCursor(result.nextCursor)
  }catch(err){if(request===sequence.current)setError(err instanceof Error?err.message:'Unable to read Dropbox.')}
  finally{if(request===sequence.current)setBusy(false)}
 }
 useEffect(()=>{load('');return()=>{sequence.current++}},[])
 const open=item=>{
  if(item.type!=='folder')return
  setHistory(old=>[...old,folder]);setFolder(item.path);setEntries([]);setCursor(null);load(item.path)
 }
 const back=()=>{
  if(!history.length)return
  const parent=history[history.length-1];setHistory(old=>old.slice(0,-1))
  setFolder(parent);setEntries([]);setCursor(null);load(parent)
 }
 return <section className="dropboxReader" aria-label="Read-only Dropbox folder browser">
  <div className="dropboxReaderTop">
   {history.length>0&&<button className="outline" onClick={back} aria-label="Back to parent Dropbox folder"><ArrowLeft size={16}/></button>}
   <strong><Cloud size={16}/> {folder||'Dropbox files'}</strong>
   <button className="outline" onClick={()=>load(folder)} disabled={busy} aria-label="Refresh Dropbox folder"><RefreshCw size={16}/></button>
  </div>
  <p>Read-only folder metadata · no file transfers</p>
  {error&&<p role="alert" className="keyError">{error}</p>}
  <ul className="dropboxEntries">{entries.map(item=><li key={item.path}>
   {item.type==='folder'?<button onClick={()=>open(item)}><Folder size={17}/>{item.name}</button>:
      <span className="dropboxFile"><File size={17}/>{item.name}</span>}
   <small>{item.type==='folder'?'Folder':typeof item.size==='number'?Math.ceil(item.size/1024)+' KB':'File'}</small>
  </li>)}</ul>
  {!busy&&!error&&entries.length===0&&<p>No files or folders on this page.</p>}
  {busy&&<p role="status">Loading Dropbox…</p>}
  {cursor&&<button className="outline" disabled={busy} onClick={()=>load(folder,cursor)}>Load more</button>}
 </section>
}
