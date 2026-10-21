import React,{useState} from 'react'
import {Download,FileText} from 'lucide-react'
import './chat-document-card.css'
import {renderChatDocument,downloadChatDocument} from './chat-document-service.js'
export default function ChatDocumentCard({document}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 if(!document||typeof document.source!=='string'||!['docx','md','pdf'].includes(document.format))return null
 const save=async()=>{
  if(busy)return
  setBusy(true);setError('')
  try{
   const result=await renderChatDocument({format:document.format,title:document.title,source:document.source})
   downloadChatDocument(result)
  }catch(e){setError(e.message||'Download failed.')}finally{setBusy(false)}
 }
 return <section className="chatDocumentCard" aria-label="Generated document">
  <div className="chatDocumentInfo"><FileText size={20} aria-hidden="true"/>
   <span><strong>{document.name}</strong><small>{document.format.toUpperCase()} · Created from AI-authored content · {document.bytes?.toLocaleString()||'?'} bytes</small></span>
  </div>
  <button className="outline" type="button" disabled={busy} onClick={save}><Download size={15}/>{busy?'Preparing…':'Download file'}</button>
  {error&&<p role="alert" className="errorText">{error}</p>}
 </section>
}
