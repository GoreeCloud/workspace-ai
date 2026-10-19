import {readDropboxFolder, DropboxReadError} from './dropbox-reader.mjs'

// Reuse only the existing, verified local Dropbox token. Requests never supply remote URLs.
export function attachDropboxReadRoute(app, {origins,getToken,getRevision,invalidate}, reader=readDropboxFolder) {
  app.get('/api/integrations/dropbox/data', async (req,res)=>{
    if ((req.headers.origin && !origins.has(req.headers.origin)) || req.headers['sec-fetch-site']==='cross-site')
      return res.status(403).json({error:'Origin not allowed.'})
    const token=getToken()
    if(!token)return res.status(409).json({error:'Connect Dropbox before browsing.'})
    const revision=getRevision()
    try {
      const data=await reader(token,{path:req.query.path,cursor:req.query.cursor})
      if(revision!==getRevision())return res.status(409).json({error:'Dropbox connection changed while loading.'})
      return res.json({path:data.path,entries:data.entries,nextCursor:data.nextCursor,readOnly:true})
    }catch(error){
      if(revision!==getRevision())return res.status(409).json({error:'Dropbox connection changed while loading.'})
      const code=error instanceof DropboxReadError?error.status:503
      if(code===401)invalidate()
      return res.status(code).json({error:error instanceof DropboxReadError?error.message:'Unable to read Dropbox metadata.'})
    }
  })
}
