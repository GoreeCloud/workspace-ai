import React,{useRef,useState} from 'react'
import {Plus,Camera,Images,FileText,Trash2,BookOpen,ChevronDown} from 'lucide-react'
import {MAX_CHAT_ATTACHMENTS,imageFromFile,textFromFile} from './chat-attachments.js'

export default function ChatAttachments({items,onChange,onError,disabled=false,onSavedPrompt,availablePrompts=[]}){
 const [open,setOpen]=useState(false)
 const camera=useRef(null),photos=useRef(null),files=useRef(null)
 const upload=async(input)=>{
  const selected=Array.from(input?.files||[]);if(input)input.value='';setOpen(false)
  if(!selected.length)return
  try{
   if(items.length+selected.length>MAX_CHAT_ATTACHMENTS)throw Error('A message supports at most '+MAX_CHAT_ATTACHMENTS+' attachments')
   const prepared=[]
   for(const file of selected)prepared.push(file.type.startsWith('image/')?await imageFromFile(file):await textFromFile(file))
   if([...items,...prepared].filter(a=>a.kind==='image').length>2)throw Error('Add at most two images per message')
   onChange([...items,...prepared])
  }catch(e){onError(String(e.message||e))}
 }
 const promptChoice=item=>{onSavedPrompt(item);setOpen(false)}
 return <>
  <div className="chatAttachmentControl">
   <button className="chatEmbeddedButton" type="button" aria-label="Add to chat" aria-expanded={open} onClick={()=>setOpen(v=>!v)} disabled={disabled}><Plus size={19}/><ChevronDown size={12}/></button>
   {open&&<div className="chatContextPopup" role="group" aria-label="Add attachment">
    <button type="button" onClick={()=>camera.current?.click()}><Camera size={16}/> Camera</button>
    <button type="button" onClick={()=>photos.current?.click()}><Images size={16}/> Photos</button>
    <button type="button" onClick={()=>files.current?.click()}><FileText size={16}/> Files</button>
    {availablePrompts.length>0&&<details><summary><BookOpen size={16}/> Saved prompts</summary><div className="chatPromptChoices">{availablePrompts.map(p=><button type="button" key={p.id} onClick={()=>promptChoice(p)}>{p.title}</button>)}</div></details>}
   </div>}
  </div>
  <input ref={camera} type="file" accept="image/*" capture="environment" hidden aria-label="Capture photo" onChange={e=>void upload(e.target)}/>
  <input ref={photos} type="file" accept="image/*" multiple hidden aria-label="Choose photos" onChange={e=>void upload(e.target)}/>
  <input ref={files} type="file" accept="image/*,.txt,.md,.csv,.json,.log,.yaml,.yml,.xml,.js,.ts,.py,.html,.css" multiple hidden aria-label="Choose files" onChange={e=>void upload(e.target)}/>
  {items.length>0&&<div className="chatAttachmentPreview" aria-label="Pending attachments">
   {items.map((item,i)=><div className="chatAttachmentChip" key={i}>
    {item.kind==='image'?<img src={item.dataUrl} alt={'Preview: '+item.name}/>:<FileText size={20}/>}
    <span>{item.name}</span><button type="button" aria-label={'Remove '+item.name} onClick={()=>onChange(items.filter((_,index)=>index!==i))}><Trash2 size={14}/></button>
   </div>)}
  </div>}
 </>
}
