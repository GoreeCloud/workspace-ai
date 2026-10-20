import React,{useState} from 'react'
import {fetchDriveFileSnapshot,replaceLinkedSnapshot,MAX_LINKED_SOURCES} from './project-linked-source.js'
export default function ProjectDriveLinks({project,onUpdate,busy=false}){
 const [options,setOptions]=useState([])
 const [selected,setSelected]=useState('')
 const [working,setWorking]=useState(false)
 const [error,setError]=useState('')
 const [message,setMessage]=useState('')
 if(!(project.api||[]).includes('google-drive'))return null
 const load=async()=>{
  setWorking(true);setError('');setOptions([]);setSelected('')
  try{
   const response=await fetch('/api/google/drive/list',{method:'GET',redirect:'error'})
   const data=await response.json()
   if(!response.ok||data.readOnly!==true||!Array.isArray(data.files))throw Error('Connect Google Drive in Workspace AI first.')
   setOptions(data.files.filter(f=>typeof f?.id==='string'&&/^[a-zA-Z0-9_-]{10,160}$/.test(f.id)&&typeof f.name==='string'&&f.name.length<=100))
  }catch(e){setError(e.message||'Unable to list authorized files.')}
  finally{setWorking(false)}
 }
 const link=async()=>{
  const file=options.find(x=>x.id===selected)
  if(working||!file)return
  setWorking(true);setError('');setMessage('')
  try{
   if((project.linkedSources||[]).length>=MAX_LINKED_SOURCES)throw Error('Maximum five linked sources.')
   const source={id:crypto.randomUUID(),kind:'google-drive-file',fileId:file.id,name:file.name,linkedAt:Date.now()}
   const snapshot=await fetchDriveFileSnapshot(source)
   replaceLinkedSnapshot(project.files,source.id,snapshot)
   onUpdate(p=>({files:replaceLinkedSnapshot(p.files,source.id,snapshot),linkedSources:[...(p.linkedSources||[]),source]}))
   setMessage('Linked '+file.name+'. Refreshes while this project is open.')
   setSelected('')
  }catch(e){setError(e.message||'Could not link this file.')}
  finally{setWorking(false)}
 }
 return <div className="projectDriveLinks">
  <label htmlFor="project-drive-source">Already-authorized Google Drive files</label>
  <div className="projectCloudRow">
   <button type="button" className="outline" disabled={busy||working} onClick={load}>Load authorized files</button>
   <select id="project-drive-source" value={selected} disabled={busy||working||!options.length} onChange={e=>setSelected(e.target.value)}>
    <option value="">Select a text file</option>
    {options.map(f=><option value={f.id} key={f.id}>{f.name}</option>)}
   </select>
   <button className="outline" type="button" disabled={busy||working||!selected} onClick={link}>Link Drive file</button>
  </div>
  <p className="projectHint">Existing files outside this list require Google Picker, which is not yet implemented.</p>
  {error&&<p className="projectAlert" role="alert">{error}</p>}
  {message&&<p role="status" className="projectHint">{message}</p>}
 </div>
}
