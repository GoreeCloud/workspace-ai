import React,{useState} from 'react'

// Explicit, bounded GitHub source preview. Never forwarded to other providers.
export default function ProjectGitHubSource({enabled=false,projectId}){
 const [repo,setRepo]=useState('')
 const [path,setPath]=useState('')
 const [reading,setReading]=useState(false)
 const [preview,setPreview]=useState(null)
 const [error,setError]=useState('')
 const load=async()=>{
  if(!enabled||reading)return
  const target=projectId
  setReading(true);setPreview(null);setError('')
  try{
   const params=new URLSearchParams({repo:repo.trim(),path:path.trim()})
   const res=await fetch('/api/integrations/github/source?'+params.toString(),{method:'GET',redirect:'error'})
   const data=await res.json()
   if(!res.ok)throw Error(data.error||'GitHub source unavailable')
   if(data.readOnly!==true||typeof data.content!=='string')throw Error('Unexpected GitHub source response')
   if(target===projectId)setPreview({repo:data.repo,path:data.path,sha:data.sha,content:data.content.slice(0,16000),size:data.size})
  }catch(e){if(target===projectId)setError(e.message||'GitHub source unavailable')}
  finally{setReading(false)}
 }
 return <div className="projectGithubSource">
  <h4>Read GitHub source file</h4>
  <p className="projectHint">Preview one UTF-8 text or source file from a repository owned by GoreeCloud. The server checks your connected GitHub token and restricts the request to the GitHub Contents API. No repository changes or cross-provider forwarding.</p>
  <div className="projectGithubInputs">
   <label>Repository<input aria-label="GoreeCloud repository name" placeholder="workspace-ai" maxLength={100} value={repo} onChange={e=>{setRepo(e.target.value);setPreview(null)}}/></label>
   <label>File path<input aria-label="GitHub source path" placeholder="src/App.jsx" maxLength={220} value={path} onChange={e=>{setPath(e.target.value);setPreview(null)}}/></label>
  </div>
  <button className="outline" type="button" disabled={!enabled||reading||!repo.trim()||!path.trim()} onClick={load}>{reading?'Loading…':'Read selected file'}</button>
  {!enabled&&<p className="projectHint">Select GitHub for this project and verify the GoreeCloud GitHub connection first.</p>}
  {error&&<p className="projectAlert" role="alert">{error}</p>}
  {preview&&<details open className="projectGithubPreview"><summary>{preview.repo}/{preview.path} · {preview.size} bytes · read only</summary><pre>{preview.content}</pre>{preview.size>16000&&<small>Preview truncated to 16,000 characters.</small>}</details>}
 </div>
}
