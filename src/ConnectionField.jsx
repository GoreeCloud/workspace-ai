import React,{useState} from 'react'
export default function ConnectionField({configured,onRefresh}){
 const [value,setValue]=useState('')
 const [busy,setBusy]=useState(false)
 const [message,setMessage]=useState('')
 async function save(event){
  event.preventDefault()
  if(busy||!value.trim())return
  setBusy(true);setMessage('')
  try{
   const response=await fetch('/api/settings/credential',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:value})})
   const result=await response.json()
   if(!response.ok)throw Error(result.error||'Could not load key')
   setValue('')
   await onRefresh()
   setMessage('Key loaded for this server session.')
  }catch(error){setMessage(String(error.message||error))}
  finally{setBusy(false)}
 }
 return <form className="apiKeyForm" onSubmit={save}><label htmlFor="apiConnection">OpenAI API key</label><input id="apiConnection" type="password" value={value} autoComplete="off" spellCheck={false} onChange={e=>setValue(e.target.value)} placeholder="Paste key here" maxLength={512} required/><button className="primary" type="submit" disabled={busy||!value.trim()}>Use key</button><p className="helper">Stored in server memory until restart. API calls are billed separately.</p>{message&&<p role="status">{message}</p>}</form>
}
