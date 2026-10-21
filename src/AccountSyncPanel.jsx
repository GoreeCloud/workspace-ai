import React,{useState} from 'react'
import {Cloud,ShieldAlert,ShieldCheck} from 'lucide-react'
export default function AccountSyncPanel({sync,busy=false}){
 const [secret,setSecret]=useState('')
 const [consented,setConsented]=useState(()=>localStorage.getItem('workspace-ai-local-only-ack-v1')==='yes')
 const [working,setWorking]=useState(false)
 const local=sync.state==='local'
 async function enable(){
  setWorking(true)
  try{await sync.enable(secret);setSecret('')}finally{setWorking(false)}
 }
 return <section className="connectionCard" aria-label="Account data synchronization">
  <h3><Cloud size={19}/> Account sync and device portability</h3>
  <p>Account sync can carry projects, memories, conversations, agent definitions, saved prompts and appearance settings between devices only when a shared sync gateway is configured and you sign in to the same account on each device. Browser-local credentials, external integration tokens and server-owned schedules are not synced.</p>
  {sync.state==='enabled'?<p className="connectedText"><ShieldCheck size={16}/> End-to-end encrypted account sync active. Changes upload automatically while this tab is open and unlocked.</p>:null}
  {!sync.available?<p className="backupWarning"><ShieldAlert size={16}/> This installation has no shared sync service. Signing in does not transfer data to another device. Clearing browser data, changing devices or losing this installation can permanently lose local projects, memories and chats unless you exported a backup.</p>:
    !sync.identity?<p className="backupWarning">{sync.reauthorizeRequired?'Your ChatGPT identity token expired. Reauthorize your account under Connections to resume encrypted sync. Local data was kept.':'Sign in through Connections before enabling account sync.'}</p>:null}
  {sync.available&&sync.identity&&local&&<>
   <p>Signed in as {sync.identity.email}. Sync requires your own recovery passphrase; it is never uploaded or stored on disk by Workspace AI. You will need it to unlock on another device.</p>
   <label>Encryption passphrase (12+ characters)
    <input type="password" autoComplete="new-password" minLength={12} value={secret} onChange={e=>setSecret(e.target.value)} placeholder="Unique recovery passphrase"/>
   </label>
   <button type="button" className="primary" disabled={working||busy||secret.length<12} onClick={enable}>Enable encrypted account sync</button>
  </>}
  {sync.state==='restore-required'&&<div className="backupWarning">
    <p>Account data exists. Restore it into this browser to continue; nothing is replaced until you confirm. Export your current local data first if needed.</p>
    <button className="primary" disabled={busy} onClick={()=>sync.restore()}>Review and restore account data</button>
    <button className="outline" onClick={sync.keepLocal}>Keep data local instead</button>
  </div>}
  {sync.state==='enabled'&&<button className="outline" onClick={sync.keepLocal}>Stop syncing on this device (keep local copy)</button>}
  {sync.state==='conflict'&&<div className="backupWarning"><p>Sync paused due to a conflict or connection error. Local changes were kept.</p><button className="outline" onClick={sync.keepLocal}>Return to local mode</button></div>}
  <label className="toggle"><input type="checkbox" checked={consented} onChange={e=>{
    const next=e.target.checked;setConsented(next);localStorage.setItem('workspace-ai-local-only-ack-v1',next?'yes':'no')
  }}/> I understand that local-only work is not available on other devices and can be lost without a backup.</label>
  {sync.message&&<p className="workspaceToolNote" role="status">{sync.message}</p>}
  <p className="projectHint">Encrypted sync has version checks to stop conflicting uploads. It does not resolve simultaneous edits automatically. Data in your browser remains readable locally. Keep secure offline backups and never lose your recovery passphrase.</p>
 </section>
}
