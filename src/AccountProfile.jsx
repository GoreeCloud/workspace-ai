import React,{useRef,useState} from 'react'
import {Camera,Trash2,UserRound} from 'lucide-react'
import {accountScopedKey} from './account-workspace-scope.js'
import {AVATAR_STORAGE_NAME,profileIdentity,validAvatarDataUrl} from './profile-identity.js'
const key=()=>accountScopedKey(AVATAR_STORAGE_NAME)
const saved=()=>{try{const value=localStorage.getItem(key());return validAvatarDataUrl(value)?value:null}catch{return null}}
async function preparePhoto(file){
 if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>3*1024*1024)throw Error('Choose a JPEG, PNG or WebP photo smaller than 3 MB')
 let image,objectUrl
 try{
  if(typeof createImageBitmap==='function')try{image=await createImageBitmap(file)}catch{}
  if(!image){
   objectUrl=URL.createObjectURL(file)
   image=await new Promise((resolve,reject)=>{
    const element=new Image()
    element.onload=()=>resolve(element)
    element.onerror=()=>reject(Error('This browser cannot decode the selected photo'))
    element.src=objectUrl
   })
  }
  const canvas=document.createElement('canvas')
  canvas.width=160;canvas.height=160
  const context=canvas.getContext('2d')
  if(!context)throw Error('Unable to prepare the photo')
  const width=image.width,height=image.height
  const size=Math.min(width,height),x=(width-size)/2,y=(height-size)/2
  context.fillStyle='#fff';context.fillRect(0,0,160,160)
  context.drawImage(image,x,y,size,size,0,0,160,160)
  const result=canvas.toDataURL('image/jpeg',0.75)
  if(!validAvatarDataUrl(result))throw Error('Photo exceeds the browser-storage size limit')
  return result
 }finally{image?.close?.();if(objectUrl)URL.revokeObjectURL(objectUrl)}
}
export default function AccountProfile({status}){
 const photoInput=useRef(null)
 const [photo,setPhoto]=useState(saved)
 const [error,setError]=useState('')
 const profile=profileIdentity(status)
 async function upload(event){
  const file=event.target.files?.[0];event.target.value=''
  if(!file)return
  try{const avatar=await preparePhoto(file);localStorage.setItem(key(),avatar);setPhoto(avatar);setError('')}
  catch(e){setError(String(e.message||e))}
 }
 function clear(){try{localStorage.removeItem(key());setPhoto(null);setError('')}catch(e){setError(String(e.message||e))}}
 return <section className="connectionCard accountProfileCard" aria-label="My account and profile picture">
  <h3><UserRound size={18}/> My profile</h3>
  <div className="accountProfileRow"><div className="accountProfileAvatar">
   {photo?<img src={photo} alt="My profile picture"/>:<span aria-label="Default profile avatar">{profile.initials}</span>}
  </div><div className="accountProfileDetails"><strong>{profile.label}</strong>
   <small>{profile.guest?'Local-only guest':profile.email||'Signed-in account'}</small>
   <small>{profile.guest?'Saved to this browser only':'Signed in to the selected Workspace AI account'}</small>
  </div></div>
  <input type="file" accept="image/jpeg,image/png,image/webp" ref={photoInput} hidden aria-label="Select profile picture" onChange={e=>void upload(e)}/>
  <div className="actions"><button className="outline" type="button" onClick={()=>photoInput.current?.click()}><Camera size={15}/>{photo?'Change picture':'Add picture'}</button>
   {photo&&<button className="outline" type="button" onClick={clear}><Trash2 size={15}/>Remove</button>}</div>
  <p className="privacyInfo">This picture stays in this browser, separate for each account. It is not uploaded to ChatGPT or automatically synchronized.</p>
  {error&&<p className="notice error" role="alert">{error}</p>}
 </section>
}