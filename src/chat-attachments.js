export const MAX_CHAT_ATTACHMENTS=3
export const MAX_IMAGE_DATA_CHARS=180000
export const MAX_TEXT_FILE_CHARS=12000
export const IMAGE_MIMES=['image/jpeg','image/png','image/webp']
export const IMAGE_UPLOAD_MIMES=[...IMAGE_MIMES,'image/heic','image/heif']
const encode=v=>typeof v==='string'?v.trim():''
export function normalizeChatAttachments(value){
 if(value==null)return []
 if(!Array.isArray(value)||value.length>MAX_CHAT_ATTACHMENTS)throw Error('Too many chat attachments')
 return value.map(a=>{
  if(!a||typeof a!=='object'||Array.isArray(a))throw Error('Invalid chat attachment')
  const name=encode(a.name).slice(0,160)||'Attachment'
  if(a.kind==='image'){
   if(!IMAGE_MIMES.includes(a.mime))throw Error('Unsupported image type')
   if(typeof a.dataUrl!=='string'||a.dataUrl.length>MAX_IMAGE_DATA_CHARS||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(a.dataUrl)||!a.dataUrl.startsWith('data:'+a.mime+';base64,'))throw Error('Invalid image data')
   return {kind:'image',name,mime:a.mime,dataUrl:a.dataUrl}
  }
  if(a.kind==='text'){
   if(typeof a.text!=='string'||a.text.length>MAX_TEXT_FILE_CHARS)throw Error('Text attachment exceeds limit')
   return {kind:'text',name,text:a.text}
  }
  throw Error('Unsupported attachment type')
 })
}
export function messageWithAttachments(message){
 const text=typeof message?.content==='string'?message.content:''
 const attachments=normalizeChatAttachments(message?.attachments)
 const excerpt=attachments.filter(a=>a.kind==='text').map(a=>'\n\n[Attached text file: '+a.name+']\n'+a.text+'\n[/Attached file]')
 return (text+excerpt.join('')).slice(0,12000)
}
export function imageInputsForMessage(message){
 return normalizeChatAttachments(message?.attachments).filter(a=>a.kind==='image').map(a=>a.dataUrl)
}
export async function imageFromFile(file){
 const type=file?.type||(file?.name?.match(/\.(heic|heif|png|jpe?g|webp)$/i)?.[1]||'')
 const mime=type==='heic'?'image/heic':type==='heif'?'image/heif':type==='png'?'image/png':type==='jpg'||type==='jpeg'?'image/jpeg':type==='webp'?'image/webp':type
 if(!file||!IMAGE_UPLOAD_MIMES.includes(mime)||file.size>8*1024*1024)throw Error('Choose a JPEG, PNG, WebP or supported HEIC photo smaller than 8 MB')
 let source,uri
 try{
  if(typeof createImageBitmap==='function'){try{source=await createImageBitmap(file)}catch{/* Try browser-native Image decode. */}}
  if(!source){
   uri=URL.createObjectURL(file)
   source=await new Promise((resolve,reject)=>{
    const img=new Image()
    img.onload=()=>resolve(img)
    img.onerror=()=>reject(Error('This browser cannot decode this photo. Convert it to JPEG or PNG.'))
    img.src=uri
   })
  }
  const ratio=Math.min(1,1024/Math.max(source.width,source.height))
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(source.width*ratio));canvas.height=Math.max(1,Math.round(source.height*ratio))
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Cannot prepare this image')
  ctx.drawImage(source,0,0,canvas.width,canvas.height)
  let quality=.8,dataUrl=''
  for(let n=0;n<6;n++){dataUrl=canvas.toDataURL('image/jpeg',quality);if(dataUrl.length<=MAX_IMAGE_DATA_CHARS)break;quality-=.12}
  if(dataUrl.length>MAX_IMAGE_DATA_CHARS)throw Error('This image cannot be compressed to the chat safety limit')
  return normalizeChatAttachments([{kind:'image',name:file.name||'Photo',mime:'image/jpeg',dataUrl}])[0]
 }finally{source?.close?.();if(uri)URL.revokeObjectURL(uri)}
}
export async function textFromFile(file){
 if(!file||file.size>16000||!(/\.(txt|md|csv|json|log|yaml|yml|xml|js|ts|py|html|css)$/i.test(file.name)))throw Error('Select a supported text file below 16 KB')
 const content=await file.text()
 if(content.length>MAX_TEXT_FILE_CHARS)throw Error('Text file exceeds 12,000 characters; split it into smaller files')
 return normalizeChatAttachments([{kind:'text',name:file.name,text:content}])[0]
}
