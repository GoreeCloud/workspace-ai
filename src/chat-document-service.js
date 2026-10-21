import {normalizeDocumentSource} from './chat-document-intent.js'
import {decodeBase64} from './document-utils.js'
export async function renderChatDocument({format,title,source},{fetchImpl=fetch}={}){
 const response=await fetchImpl('/api/documents/from-chat',{
  method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({format,title,source:normalizeDocumentSource(source)}),credentials:'same-origin',cache:'no-store'
 })
 let data
 try{data=await response.json()}catch{throw Error('Document service returned invalid JSON.')}
 if(!response.ok||data.ok!==true)throw Error(typeof data.error==='string'?data.error:'Could not create the document.')
 if(typeof data.name!=='string'||data.format!==format||typeof data.base64!=='string'||
   !Number.isSafeInteger(data.bytes)||data.bytes<12||data.bytes>6*1024*1024)
  throw Error('Document service returned an invalid file.')
 const bytes=decodeBase64(data.base64)
 if(bytes.length!==data.bytes)throw Error('Document size validation failed.')
 if(!/^[a-f0-9]{64}$/.test(data.sha256||''))throw Error('Document checksum is missing.')
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))
 const actual=Array.from(digest,v=>v.toString(16).padStart(2,'0')).join('')
 if(actual!==data.sha256)throw Error('Document integrity validation failed.')
 if(format==='pdf'&&new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')throw Error('Invalid PDF output.')
 if(format==='docx'&&!(bytes[0]===0x50&&bytes[1]===0x4b))throw Error('Invalid Word document output.')
 if(format==='md'&&!new TextDecoder().decode(bytes).trim())throw Error('Empty Markdown output.')
 return {...data,bytesBuffer:bytes}
}
export function downloadChatDocument(file){
 const blob=new Blob([file.bytesBuffer],{type:file.mime||'application/octet-stream'})
 const url=URL.createObjectURL(blob)
 const link=document.createElement('a')
 link.href=url;link.download=file.name;link.click()
 setTimeout(()=>URL.revokeObjectURL(url),2000)
}
export function chatDocumentMetadata(file,source,title){
 return {title,format:file.format,name:file.name,bytes:file.bytes,source:normalizeDocumentSource(source)}
}
