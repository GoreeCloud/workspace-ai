import React,{useEffect,useState} from 'react'
import {Download,MonitorSmartphone,ShieldAlert} from 'lucide-react'
import {availableInstallPrompt,requestWorkspaceInstallation} from './register-pwa.js'
export default function PlatformInstallPanel(){
 const [prompt,setPrompt]=useState(()=>availableInstallPrompt()),[installed,setInstalled]=useState(false)
 useEffect(()=>{
  const media=matchMedia('(display-mode: standalone)')
  const check=()=>setInstalled(media.matches||navigator.standalone===true)
  const offer=()=>setPrompt(availableInstallPrompt())
  check();media.addEventListener?.('change',check)
  window.addEventListener('goreecloud:pwa-install-available',offer)
  return ()=>{media.removeEventListener?.('change',check);window.removeEventListener('goreecloud:pwa-install-available',offer)}
 },[])
 async function install(){if(!prompt)return;await requestWorkspaceInstallation();setPrompt(null)}
 const platform=/Android/i.test(navigator.userAgent)?'Android':/iPad|iPhone|iPod/i.test(navigator.userAgent)?'iOS':/Windows/i.test(navigator.userAgent)?'Windows':/Linux/i.test(navigator.userAgent)?'Linux':'this device'
 return <section className="connectionCard platformInstallPanel">
  <h3><MonitorSmartphone size={18}/> Apps &amp; devices</h3>
  <p>Workspace AI uses a responsive interface designed for web and mobile screens.</p>
  <p><strong>Detected platform:</strong> {platform}</p>
  {installed?<p>Workspace AI is currently running in an installed app window.</p>:prompt?<button className="primary" type="button" onClick={()=>void install()}><Download size={15}/> Install Workspace AI</button>:
   <p>Use your browser's <strong>Install app</strong> or <strong>Add to Home Screen</strong> option if available.</p>}
  <p className="privacyInfo"><ShieldAlert size={15}/> App installation does not configure hosting or sync. The current backend accepts connections only from the same local machine. Mobile devices require separately secured hosting and user authentication.</p>
  <p className="privacyInfo">Linux and Windows desktop installer builds and signing have not yet been verified or published.</p>
 </section>
}