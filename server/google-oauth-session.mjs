// Local, opt-in Google OAuth authorization code + PKCE. No persisted tokens.
import {createHash,randomBytes} from 'node:crypto'

export const GOOGLE_SCOPES=Object.freeze({
  gmail:'https://www.googleapis.com/auth/gmail.readonly',
  'google-drive':'https://www.googleapis.com/auth/drive.file'
})
const EXPECTED_EMAIL='goreecloud@gmail.com'
const random=()=>randomBytes(32).toString('base64url')
const hash=v=>createHash('sha256').update(v).digest('base64url')
const ERROR=(status,message)=>Object.assign(new Error(message),{status})
const fixedFetch=async(url,options,fetcher)=>{
  let result
  try{result=await fetcher(url,{...options,redirect:'error',signal:AbortSignal.timeout(12000)})}
  catch{throw ERROR(503,'Google authorization service is unavailable.')}
  return result
}
const limitedJson=async(response,limit=12000)=>{
  const declared=Number(response.headers?.get?.('content-length'))
  if(Number.isFinite(declared)&&declared>limit)throw ERROR(502,'Google authorization response is oversized.')
  let text
  if(response.body&&typeof response.body.getReader==='function'){
    const reader=response.body.getReader(),parts=[];let length=0
    try{for(;;){const {done,value}=await reader.read();if(done)break
      length+=value.byteLength
      if(length>limit)throw ERROR(502,'Google authorization response is oversized.')
      parts.push(Buffer.from(value))
    }}finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
    text=Buffer.concat(parts).toString('utf8')
  }else{
    text=await response.text()
    if(Buffer.byteLength(text)>limit)throw ERROR(502,'Google authorization response is oversized.')
  }
  try{return JSON.parse(text)}catch{throw ERROR(502,'Google authorization response is invalid.')}
}
export function makeGoogleOAuthSession({clientId='',clientSecret='',redirectUri='',now=Date.now,fetcher=fetch}={}){
  const configured=/^[\w-]+\.apps\.googleusercontent\.com$/.test(clientId)&&typeof clientSecret==='string'&&clientSecret.length>=8&&
    /^http:\/\/127\.0\.0\.1:[0-9]+\/api\/google\/callback$/.test(redirectUri)
  const attempts=new Map(),sessions=new Map(),revisions=new Map()
  const rev=service=>revisions.get(service)||0
  const next=service=>revisions.set(service,rev(service)+1)
  const invalidate=service=>{sessions.delete(service);next(service);for(const [state,a] of attempts)if(a.service===service)attempts.delete(state)}
  const status=()=>Object.fromEntries(Object.keys(GOOGLE_SCOPES).map(service=>{
    const current=sessions.get(service)
    const connected=!!(current&&current.expiresAt>now()+10000)
    return [service,{connected,expiresAt:connected?current.expiresAt:null}]
  }))
  const start=service=>{
    if(!configured)throw ERROR(503,'Google OAuth client is not configured.')
    if(!Object.hasOwn(GOOGLE_SCOPES,service))throw ERROR(404,'Unsupported Google integration.')
    for(const [key,item] of attempts)if(item.expiresAt<=now()||item.service===service)attempts.delete(key)
    if(attempts.size>=8)throw ERROR(429,'Too many pending Google authorization attempts.')
    next(service) // Invalidates older in-flight authorization attempts and provider reads.
    const state=random(),verifier=random()
    attempts.set(state,{service,verifier,revision:rev(service),expiresAt:now()+5*60000})
    const url=new URL('https://accounts.google.com/o/oauth2/v2/auth')
    Object.entries({client_id:clientId,redirect_uri:redirectUri,response_type:'code',scope:'openid email '+GOOGLE_SCOPES[service],
      state,code_challenge:hash(verifier),code_challenge_method:'S256',access_type:'online',include_granted_scopes:'false',
      login_hint:EXPECTED_EMAIL,prompt:'select_account'}).forEach(([key,value])=>url.searchParams.set(key,value))
    return url.toString()
  }
  const finish=async({state,code,error}={})=>{
    const attempt=typeof state==='string'?attempts.get(state):null
    if(attempt)attempts.delete(state) // single use even on errors
    if(!attempt||attempt.expiresAt<=now())throw ERROR(400,'Google authorization state expired or invalid.')
    if(error||typeof code!=='string'||code.length<3||code.length>2048)throw ERROR(400,'Google authorization was declined or invalid.')
    const requested=GOOGLE_SCOPES[attempt.service]
    const reply=await fixedFetch('https://oauth2.googleapis.com/token',{
      method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({
        code,client_id:clientId,client_secret:clientSecret,redirect_uri:redirectUri,
        grant_type:'authorization_code',code_verifier:attempt.verifier
      }).toString()
    },fetcher)
    if(!reply.ok)throw ERROR(401,'Google rejected the authorization exchange.')
    const tokens=await limitedJson(reply)
    if(typeof tokens.access_token!=='string'||tokens.access_token.length>4096||tokens.token_type?.toLowerCase()!=='bearer'||
      !Number.isFinite(tokens.expires_in)||tokens.expires_in<60||tokens.expires_in>86400||
      typeof tokens.scope!=='string'||!tokens.scope.split(/\s+/).includes(requested))
      throw ERROR(401,'Google did not grant the required read scope.')
    const identity=await fixedFetch('https://openidconnect.googleapis.com/v1/userinfo',{
      method:'GET',headers:{Authorization:'Bearer '+tokens.access_token}
    },fetcher)
    if(!identity.ok)throw ERROR(401,'Google account verification failed.')
    const info=await limitedJson(identity)
    if(info.email!==EXPECTED_EMAIL||info.email_verified!==true)throw ERROR(403,'Only the authorized GoreeCloud Google account can connect.')
    const service=attempt.service
    if(rev(service)!==attempt.revision)throw ERROR(409,'Google connection was revoked during authorization.')
    // A callback cannot overwrite a newer connection or a user-revoked connection.
    sessions.set(service,{token:tokens.access_token,expiresAt:now()+Math.min(tokens.expires_in,3600)*1000,scope:requested})
    next(service)
    return {service,account:EXPECTED_EMAIL,connected:true}
  }
  const getToken=service=>{
    const active=sessions.get(service)
    if(!active)return null
    if(active.expiresAt<=now()+10000){invalidate(service);return null}
    return active.token
  }
  const activeRevision=service=>rev(service)
  return {configured,start,finish,getToken,status,invalidate,activeRevision}
}
