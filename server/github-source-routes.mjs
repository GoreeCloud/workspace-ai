// Read-only and token-revision-guarded GitHub text file route.
import {readGitHubSource,GitHubSourceError} from './github-source.mjs'
export function attachGitHubSourceRoute(app,{origins,getToken,getRevision,invalidate},reader=readGitHubSource){
 app.get('/api/integrations/github/source',async(req,res)=>{
  if((req.headers.origin&&!origins.has(req.headers.origin))||req.headers['sec-fetch-site']==='cross-site')
   return res.status(403).json({error:'Origin not allowed.'})
  const token=getToken()
  if(!token)return res.status(409).json({error:'Connect the GoreeCloud GitHub account first.'})
  const revision=getRevision()
  try{
   const result=await reader(token,{repo:req.query.repo,path:req.query.path})
   if(revision!==getRevision())return res.status(409).json({error:'GitHub session changed during read.'})
   return res.json(result)
  }catch(error){
   if(revision!==getRevision())return res.status(409).json({error:'GitHub session changed during read.'})
   if(error instanceof GitHubSourceError&&error.status===401)invalidate()
   return res.status(error instanceof GitHubSourceError?error.status:503)
    .json({error:error instanceof GitHubSourceError?error.message:'GitHub source could not be loaded.'})
  }
 })
}
