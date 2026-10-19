export const TOKEN_PROVIDERS={todoist:{url:'https://api.todoist.com/rest/v2/projects',method:'GET'},dropbox:{url:'https://api.dropboxapi.com/2/users/get_current_account',method:'POST',body:'null'},linear:{url:'https://api.linear.app/graphql',method:'POST',body:JSON.stringify({query:'query { viewer { id name } }'})},github:{url:'https://api.github.com/user',method:'GET'},'cloudflare-pages':{url:'https://api.cloudflare.com/client/v4/user/tokens/verify',method:'GET'}}
export async function checkProviderToken(id,token,fetchImpl=fetch){
 const provider=TOKEN_PROVIDERS[id]
 if(!provider)return {status:'setup-required',message:'Provider requires OAuth or configured MCP.'}
 if(typeof token!=='string'||token.trim().length<8||token.length>2048)return {status:'invalid',message:'Enter a valid access token.'}
 try{
  const headers={Authorization:'Bearer '+token.trim(),Accept:'application/json'}
  if(id==='github'){headers['X-GitHub-Api-Version']='2022-11-28';headers['User-Agent']='GoreeCloud-Workspace-AI'}
  if(provider.method==='POST')headers['Content-Type']='application/json'
  const response=await fetchImpl(provider.url,{method:provider.method,headers,body:provider.body,redirect:'error',signal:AbortSignal.timeout(10000)})
  if(response.status===401)return {status:'invalid',message:'Provider rejected credentials.'}
  if(response.status===403)return {status:'restricted',message:'Permission denied.'}
  if(!response.ok)return {status:'unavailable',message:'Provider returned HTTP '+response.status}
  if(id==='github'){const data=await response.json();if(data.login!=='GoreeCloud')return {status:'restricted',message:'Only GoreeCloud GitHub identity is permitted.'}}
  if(id==='cloudflare-pages'){const data=await response.json();if(!data.success)return {status:'restricted',message:'Cloudflare token not accepted.'}}
  if(id==='linear'){const data=await response.json();if(data.errors?.length||!data.data?.viewer)return {status:'restricted',message:'Linear viewer query denied.'}}
  return {status:'connected',message:'Token accepted for read-only verification.'}
 }catch{return {status:'unavailable',message:'Connection check unavailable. Retry.'}}
}
