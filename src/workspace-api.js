// Resilient, same-origin JSON transport for local Workspace AI control requests.
// No automatic retries: some endpoints mutate local or remote account state.
const MAX_ERROR_LENGTH=300
export async function workspaceJson(url,{data,headers={},timeoutMs=60000,fetchImpl=fetch}={}){
 if(typeof url!=='string'||!url.startsWith('/api/')||url.startsWith('//'))
  throw Error('Workspace API requests must use a local /api/ path.')
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>180000)
  throw Error('Unsupported request timeout.')
 const hasBody=data!==undefined&&data!==null
 const controller=new AbortController()
 const timer=setTimeout(()=>controller.abort(),timeoutMs)
 try{
  const response=await fetchImpl(url,{
   method:hasBody?'POST':'GET',
   headers:{...(hasBody?{'content-type':'application/json'}:{}),...headers},
   ...(hasBody?{body:JSON.stringify(data)}:{}),
   signal:controller.signal,credentials:'same-origin',cache:'no-store'
  })
  const contentType=response.headers?.get?.('content-type')||''
  if(!/(?:^|\b)application\/(?:[\w.-]+\+)?json(?:\b|;)/i.test(contentType))
   throw Error('Workspace AI returned a non-JSON response (HTTP '+response.status+'). Retry after checking the local service.')
  let body
  try{body=await response.json()}
  catch{throw Error('Workspace AI returned incomplete or invalid JSON (HTTP '+response.status+').')}
  if(body===null||typeof body!=='object'||Array.isArray(body))
   throw Error('Workspace AI returned an unexpected response.')
  if(!response.ok){
   const message=typeof body.error==='string'&&body.error.trim()?body.error.trim().slice(0,MAX_ERROR_LENGTH):'Workspace AI request failed (HTTP '+response.status+').'
   throw Error(message)
  }
  return body
 }catch(error){
  if(controller.signal.aborted)throw Error('Workspace AI request timed out. Check the local service before retrying.')
  if(error instanceof TypeError)throw Error('Unable to reach the Workspace AI service. Check that the local backend is running.')
  throw error
 }finally{clearTimeout(timer)}
}
