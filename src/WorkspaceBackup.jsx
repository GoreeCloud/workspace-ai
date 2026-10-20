import React, {useState} from 'react'
import {Download,Upload,FileArchive} from 'lucide-react'
import {BACKUP_MAX_BYTES,createWorkspaceBackup,parseWorkspaceBackup} from './workspace-backup.js'

export default function WorkspaceBackup({chats,workspace,onRestore,busy}) {
 const [archive,setArchive] = useState(null)
 const [mode,setMode] = useState('merge')
 const [status,setStatus] = useState('')
 const [failure,setFailure] = useState('')

 function download() {
  setFailure('')
  try {
   const payload = createWorkspaceBackup(chats,workspace)
   const blob = new Blob([JSON.stringify(payload,null,2)+'\n'],{type:'application/json'})
   const url = URL.createObjectURL(blob)
   const link = document.createElement('a')
   link.href = url
   link.download = 'goreecloud-workspace-ai-backup-' + new Date().toISOString().slice(0,10) + '.json'
   document.body.append(link)
   link.click()
   link.remove()
   window.setTimeout(()=>URL.revokeObjectURL(url),1000)
   setStatus('Backup prepared locally. Store the downloaded file somewhere private.')
  } catch(e) { setFailure(e.message || 'Could not create backup') }
 }
 async function choose(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  setArchive(null);setFailure('');setStatus('')
  if(!file)return
  if(file.size > BACKUP_MAX_BYTES) {setFailure('The backup exceeds the 12 MB limit');return}
  try {
   const parsed = parseWorkspaceBackup(await file.text())
   setArchive(parsed)
   setStatus('Backup validated. No local conversations have been changed.')
  } catch(e) {setFailure(e.message || 'Could not read backup')}
 }
 function restore() {
  if(!archive || busy)return
  if(mode==='replace' && !window.confirm('Replace all browser-local conversations, projects, and pins with this backup? This cannot be undone unless you have another backup.'))return
  setFailure('')
  try {
   const result = onRestore(archive,mode)
   setStatus('Restored ' + result.addedChats + ' conversations' + (result.skippedChats ? '; skipped ' + result.skippedChats + ' already present or beyond the 50-chat limit.' : '.') )
   setArchive(null)
  }catch(e){setFailure(e.message || 'Restore failed')}
 }
 return <div className="backupPanel">
  <div className="backupHeading"><FileArchive size={19}/><div><strong>Workspace backup & restore</strong><p>Portable JSON for conversations, projects, and pins. No account or integration credentials are exported.</p></div></div>
  <p className="backupWarning">The archive contains your chat text, which may be sensitive. Save it somewhere you trust. This browser retains at most 50 conversations.</p>
  <div className="actions"><button className="outline" onClick={download} type="button" disabled={busy}><Download size={15}/>Download backup</button>
   <label className="backupFile"><Upload size={15}/>Choose backup file<input aria-label="Choose Workspace AI backup file" type="file" accept=".json,application/json" onChange={choose} disabled={busy}/></label></div>
  {archive && <div className="backupPreview"><strong>Ready to restore</strong><p>{archive.chats.length} conversations · {archive.workspace.projects.length} projects · {archive.workspace.pinned.length} pins</p>
   <label htmlFor="backup-mode">Restore behavior</label>
   <select id="backup-mode" value={mode} onChange={e=>setMode(e.target.value)} disabled={busy}>
    <option value="merge">Merge (keep existing chats on ID conflicts)</option>
    <option value="replace">Replace all local workspace data</option>
   </select>
   <button className="primary" onClick={restore} disabled={busy}>{mode==='replace'?'Replace local data':'Merge backup'}</button>
  </div>}
  {failure&&<p role="alert" className="backupMessage error">{failure}</p>}
  {status&&!failure&&<p role="status" className="backupMessage">{status}</p>}
 </div>
}
