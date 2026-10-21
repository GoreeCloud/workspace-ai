import React from 'react'
import {Plug,SlidersHorizontal,Palette,Shield,FolderKanban,KeyRound,UserRound,MonitorSmartphone} from 'lucide-react'
const sections=[
 {id:'profile',title:'My profile',subtitle:'Account name and profile picture',icon:UserRound},
 {id:'connections',title:'Connections & accounts',subtitle:'Sign-in, authenticated services and API keys',icon:Plug},
 {id:'routing',title:'Models & billing',subtitle:'Provider selection, fallback and spending awareness',icon:SlidersHorizontal},
 {id:'appearance',title:'Appearance & accessibility',subtitle:'Theme, chat focus and interface preferences',icon:Palette},
 {id:'privacy',title:'Data, sync & privacy',subtitle:'Local-only risks, encrypted sync and backups',icon:Shield},
 {id:'platforms',title:'Apps & devices',subtitle:'Web, mobile, Linux and Windows installation',icon:MonitorSmartphone}
]
export default function SettingsCategories({onOpen}){
 return <div className="workspacePage settingsCategoryPage"><header className="workspacePageTop"><div><h1>Settings</h1><p>Choose a category to manage your workspace preferences.</p></div></header>
  <div className="settingsCategoryGrid">{sections.map(section=>{const Icon=section.icon;return <button type="button" key={section.id} className="settingsCategoryCard" onClick={()=>onOpen(section.id)}>
   <span className="settingsCategoryIcon"><Icon size={22}/></span><span><strong>{section.title}</strong><small>{section.subtitle}</small></span><span aria-hidden="true">›</span>
  </button>})}</div>
  <p className="workspaceToolNote"><KeyRound size={15}/> Connected-service credentials remain on the local server. Project settings and browser data follow the configured account sync policy.</p>
 </div>
}
