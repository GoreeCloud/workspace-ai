// Text-only document requests, never implicit tool execution.
export const DOCUMENT_FORMATS=['docx','md','pdf']
export function documentFilename(title,format){
 if(!DOCUMENT_FORMATS.includes(format))throw Error('Unsupported document format.')
 const stem=String(title||'Document').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9 -]/g,' ').trim().replace(/\s+/g,'-').slice(0,75)||'Document'
 return stem+'.'+format
}
export function documentIntent(prompt,previous=null){
 if(typeof prompt!=='string'||prompt.length>12000)return null
 const value=prompt.trim()
 const format=/\b(word document|microsoft word|docx)\b|\.docx\b/i.test(value)?'docx':/\b(markdown|md file)\b|\.md\b/i.test(value)?'md':/\bpdf\b|\.pdf\b/i.test(value)?'pdf':null
 if(!format||!/\b(create|make|generate|write|draft|prepare|produce|export|convert|turn|save)\b/i.test(value))return null
 const refersBack=/\b(that document|the document|this document|previous document|same document|that file|the file|it)\b/i.test(value)
 const converting=/\b(version of|convert|export|turn|as (?:a |an )?|same content|make it)\b/i.test(value)
 if(refersBack&&converting){
  if(!previous)return {kind:'missing-source',format}
  const title=previous.title||'Document'
  return {kind:'convert',format,title,filename:documentFilename(title,format),source:previous.source}
 }
 const title=value.match(/\b(?:about|on|titled|called|regarding)\s+(.{3,160}?)(?:[.!?]|$)/i)?.[1]?.trim()||'Document'
 return {kind:'create',format,title,filename:documentFilename(title,format)}
}

export function documentWritingPrompt(request){
 if(request?.kind!=='create')throw Error('No document requested.')
 return 'Produce the requested document as polished Markdown. Begin with a single # title and use appropriate ## sections and lists. Avoid Markdown pipe tables and embedded images because the local DOCX/PDF renderers do not yet preserve those structures. Respond with document content only: no preface, code fence or fictitious download. Ground technical claims in supplied sources, label unknown internal details and assumptions. Workspace AI will validate and attach the file.'
}
export function normalizeDocumentSource(value){
 if(typeof value!=='string')throw Error('Document source must be text.')
 const md=value.trim()
 if(md.length<12||md.length>12000||md.includes('\u0000'))throw Error('Document is empty or exceeds 12,000 characters.')
 return md+'\n'
}
export function latestDocument(messages){
 if(!Array.isArray(messages))return null
 for(let i=messages.length-1;i>=0;i--){
  const m=messages[i]
  if(m?.role==='assistant'&&!m.error&&typeof m.document?.source==='string'&&m.document.source.length<=12000)
   return {title:m.document.title,source:m.document.source}
 }
 return null
}
