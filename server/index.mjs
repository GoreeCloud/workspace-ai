import { fileURLToPath } from 'node:url'
import 'dotenv/config'
import {createHash} from 'node:crypto'
import {createEphemeralCache} from './ephemeral-cache.mjs'
import {promptCacheKey} from './prompt-cache.mjs'
import express from 'express'
import { getHostId, publicStatus, readProfile, updateProfile } from './storage.mjs'
import { makeAttempt, consumeAttempt, exchangeCode, getPlanToken, disconnectAccount } from './oauth.mjs'
import { checkMessages, chooseRoute, validModel, streamResponse } from './stream.mjs'
import { attachCredentialSettings } from './credential-settings.mjs'
import { verifyApiKey } from './api-key-verification.mjs'
import { attachIntegrationRoutes } from './integration-routes.mjs'
import {attachMcpApprovalRoutes} from './mcp-approval-routes.mjs'
import {attachMcpLiveRoutes} from './mcp-live-routes.mjs'
import {attachGoogleRoutes} from './google-routes.mjs'
import {attachAgentRoutes} from './agent-routes.mjs'
import {attachAccountSyncRelay} from './account-sync-relay.mjs'
import {validateChatImages,multimodalChatInput} from './chat-image-input.mjs'
import {activeAccountId,rememberAccount,selectAccount} from './account-profiles.mjs'
import {attachDocumentRoutes} from './document-routes.mjs'
import {attachChatDocumentRoutes} from './ai-document-routes.mjs'
import {attachSmartImageRoutes} from './smart-image-routes.mjs'

const app = express()
const PORT = Number(process.env.WORKSPACE_AI_PORT || 3031)
const environmentApiKey = process.env.OPENAI_API_KEY?.trim() || ''
let apiKey = environmentApiKey
let apiKeySource = environmentApiKey ? 'environment' : null
const apiModel = process.env.OPENAI_API_MODEL || 'gpt-5-mini'
const clientOrigin = 'http://127.0.0.1:' + PORT
const callback = 'http://127.0.0.1:' + PORT + '/auth/callback'
const endpoint = 'https://api.openai.com/v1'
const modelCatalogCache=createEphemeralCache({ttlMs:60_000,maxEntries:24})
const cooldownCodes = new Set([
  'subscription_sharing_usage_limit_exceeded',
  'subscription_sharing_usage_unavailable',
  'subscription_sharing_user_not_eligible',
  'subscription_sharing_user_unavailable'
])

app.disable('x-powered-by')
app.use((req, res, next) => {
  const host = req.headers.host
  if (host !== '127.0.0.1:' + PORT) return res.status(403).json({ error: 'Local-only host required.' })
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self'; img-src 'self' data: https://ideogram.ai https://*.ideogram.ai; style-src 'self'; script-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'")
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (req.headers.origin && !['http://127.0.0.1:5173', clientOrigin].includes(req.headers.origin)) return res.status(403).json({ error: 'Origin not allowed.' })
  }
  next()
})
app.use('/api/chat',express.json({limit:'520kb'}))
app.use('/api/documents',express.json({limit:'9mb'}))
app.use('/api/smart-images',express.json({limit:'24kb'}))
app.use(express.json({ limit: '90kb' }))
const localOrigins=new Set([clientOrigin,'http://127.0.0.1:5173'])
attachDocumentRoutes(app,localOrigins)
const smartImageRoutes=attachSmartImageRoutes(app,localOrigins)
const mcpApproval=attachMcpApprovalRoutes(app,localOrigins)
const mcpIntegration=attachIntegrationRoutes(app,localOrigins,{onMcpChange:provider=>mcpApproval.revokeProvider(provider)})
attachMcpLiveRoutes(app,localOrigins,{broker:mcpApproval,...mcpIntegration,providerReady:mcpIntegration.isMcpReady})
attachGoogleRoutes(app,localOrigins)
attachAgentRoutes(app,localOrigins,{getApiKey:()=>environmentApiKey,model:apiModel})
attachAccountSyncRelay(app,localOrigins)
const credentialSettings = attachCredentialSettings(app, {
  allowedOrigins: new Set([clientOrigin, 'http://127.0.0.1:5173']),
  getCredential: () => apiKey,
  setCredential: value => { apiKey = value; apiKeySource = 'session' },
  clearCredential: () => { apiKey = environmentApiKey; apiKeySource = environmentApiKey ? 'environment' : null },
  verifyCredential: verifyApiKey
})

app.get('/api/status', async (_req, res) => {
  res.json({ ...publicStatus(await readProfile(), Boolean(apiKey)), apiKeySource, apiVerification: credentialSettings.getVerification() })
})

app.get('/api/auth/start', async (req, res) => {
  const profile = await readProfile()
  const url = makeAttempt({
    hostId: await getHostId(), callback,
    current: profile.account?.client_id ? profile.account : null,
    allowOtherAccount:req.query.mode==='add'
  })
  res.json({ url })
})

app.get('/auth/callback', async (req, res) => {
  let error = null
  try {
    const state = typeof req.query.state === 'string' ? req.query.state : ''
    const attempt = consumeAttempt(state)
    if (req.query.error) throw new Error('Authorization was declined or unavailable.')
    if (typeof req.query.code !== 'string') throw new Error('Missing authorization code.')
    const account = await exchangeCode({
      code: req.query.code, issuedId: typeof req.query.client_id === 'string' ? req.query.client_id : '',
      attempt
    })
    await updateProfile(profile => rememberAccount(profile,account))
    smartImageRoutes.clearSession()
    modelCatalogCache.clear()
  } catch (reason) {
    error = reason instanceof Error ? reason.message : 'Unknown authorization error.'
  }
  // Never redirect tokens, codes, or the OAuth URL back into browser storage.
  res.redirect(303, clientOrigin + '/?auth=' + (error ? 'failed' : 'connected'))
})

app.post('/api/auth/disconnect', async (req, res) => {
  try{
    const revoked=await disconnectAccount(req.body?.accountId)
    smartImageRoutes.clearSession()
    modelCatalogCache.clear()
    res.json({revoked,warning:revoked?null:'Local credentials cleared; remote revocation was not confirmed. Disconnect this app in ChatGPT Settings.'})
  }catch(e){res.status(409).json({error:String(e.message).slice(0,190)})}
})
app.post('/api/auth/switch', async (req,res) => {
 try{
  const selected=req.body?.accountId
  if(!(selected===null||typeof selected==='string'))return res.status(400).json({error:'Select a saved account or local-only guest'})
  const updated=await updateProfile(profile=>selectAccount(profile,selected))
  smartImageRoutes.clearSession()
  modelCatalogCache.clear()
  return res.json({accountId:activeAccountId(updated),connected:Boolean(updated.account?.access_token)})
 }catch(e){return res.status(409).json({error:String(e.message).slice(0,190)})}
})
function verifyActiveAccount(req,profile){
 const submitted=req.headers['x-workspace-account-id']||null
 return submitted===activeAccountId(profile)
}

app.get('/api/models', async (req, res) => {
  const p=await readProfile()
  if(!verifyActiveAccount(req,p))return res.status(409).json({error:'Active account changed. Reload the workspace.'})
  let models = []
  let error = null
  try {
    const account=activeAccountId(p)
    const token=await getPlanToken(account)
    if(token){
      // Key uses a verified account and credential fingerprint; never caches raw tokens.
      const credentialHash=createHash('sha256').update(token).digest('hex')
      models=await modelCatalogCache.load(account+':'+credentialHash,async()=>{
        const response=await fetch(endpoint+'/models',{
          headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(12000)
        })
        if(!response.ok)throw Error('Plan model list unavailable ('+response.status+')')
        const body=await response.json()
        const visible=Array.isArray(body.models)?body.models:[]
        return visible.filter(entry=>entry?.visibility==='list'&&validModel(entry.slug)).slice(0,100)
          .map(entry=>({slug:entry.slug,name:typeof entry.display_name==='string'?entry.display_name.slice(0,100):entry.slug}))
      })
    }
  }catch(reason){error=reason.message}
  // An account could change during a concurrent upstream fetch. Never return its data.
  if(!verifyActiveAccount(req,await readProfile()))return res.status(409).json({error:'Active account changed. Reload the workspace.'})
  res.json({
    planModels: models,
    apiModel: apiKey ? apiModel : null,
    error
  })
})

function normalizedError(response, json) {
  return {
    status: response.status,
    code: json?.error?.code || '',
    message: String(json?.error?.message || json?.detail || ('OpenAI returned HTTP ' + response.status)).slice(0, 300),
    requestId: response.headers.get('x-request-id') || undefined
  }
}

app.post('/api/chat', async (req, res) => {
  const messages = checkMessages(req.body?.messages)
  const images = validateChatImages(req.body?.images)
  const preference = req.body?.preference
  const fallbackAllowed = req.body?.allowApiFallback === true
  const requestedModel = req.body?.model
  if (!messages || !images || (images.length>0&&preference!=='api') || !['auto', 'plan', 'api'].includes(preference)) {
    return res.status(400).json({ error: 'Invalid conversation or provider selection.' })
  }
  const profile = await readProfile()
  if(!verifyActiveAccount(req,profile))return res.status(409).json({error:'Active account changed. Reload the workspace.'})
  const expectedAccount=activeAccountId(profile)
  const planEnabled = Boolean(profile.account?.scopes?.includes('chatgpt.tokens.use.direct') && profile.account?.access_token)
  if (preference === 'plan' && planEnabled && !validModel(requestedModel)) return res.status(400).json({ error: 'Select a valid account model.' })
  let provider = chooseRoute({ preference, planEnabled: planEnabled && validModel(requestedModel), apiConfigured: Boolean(apiKey), fallbackAllowed })
  if (!provider) return res.status(409).json({ error: 'Connect a ChatGPT plan or configure a separately billed OpenAI API key, then select a usable provider.' })
  if (provider === 'plan' && !validModel(requestedModel)) {
    return res.status(400).json({ error: 'Select a model from your ChatGPT plan model list.' })
  }

  const aborter = new AbortController()
  res.on('close', () => aborter.abort())
  const requestWith = async (route) => {
    const token = route === 'plan' ? await getPlanToken(expectedAccount) : apiKey
    if (!token) throw new Error(route === 'plan' ? 'Sign in again to renew ChatGPT plan access.' : 'OpenAI API key is missing.')
    const model = route === 'plan' ? requestedModel : apiModel
    const response = await fetch(endpoint + '/responses', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream'
      },
      body: JSON.stringify({ model, input: images.length?multimodalChatInput(messages,images):messages, store: false, stream: true,
        ...(route === 'api' ? {prompt_cache_key:promptCacheKey({accountId:expectedAccount,credential:token,model,messages})} : {}) }),
      signal: AbortSignal.any([aborter.signal, AbortSignal.timeout(180_000)])
    })
    return { response, model }
  }
  try {
    let result = await requestWith(provider)
    if (!result.response.ok) {
      const body = await result.response.json().catch(() => ({}))
      const fault = normalizedError(result.response, body)
      const shouldFallback = provider === 'plan'
        && preference === 'auto' && fallbackAllowed && Boolean(apiKey)
        && (cooldownCodes.has(fault.code) || [401, 429, 503].includes(fault.status))
      if (!shouldFallback) return res.status(fault.status).json({ error: fault.message, code: fault.code, requestId: fault.requestId })
      provider = 'api'
      result = await requestWith(provider)
      if (!result.response.ok) {
        const other = normalizedError(result.response, await result.response.json().catch(() => ({})))
        return res.status(other.status).json({ error: other.message, code: other.code, requestId: other.requestId })
      }
    }
    res.status(200)
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
    res.setHeader('X-Accel-Buffering', 'no')
    let emittedText = false
    const emit = (value) => {
      if (value.type === 'delta') emittedText = true
      if (!res.destroyed) res.write(JSON.stringify(value) + '\n')
    }
    emit({ type: 'meta', provider, model: result.model })
    try {
      await streamResponse(result.response, emit)
    } catch (streamError) {
      const quota = /subscription_sharing_(usage_limit_exceeded|usage_unavailable|user_not_eligible|user_unavailable)/.test(String(streamError?.message || streamError))
      if (!(provider === 'plan' && preference === 'auto' && fallbackAllowed && Boolean(apiKey) && !emittedText && quota)) throw streamError
      provider = 'api'
      result = await requestWith(provider)
      if (!result.response.ok) {
        const failure = normalizedError(result.response, await result.response.json().catch(() => ({})))
        throw new Error('API fallback failed (' + failure.status + '): ' + failure.message)
      }
      emit({ type: 'meta', provider, model: result.model })
      await streamResponse(result.response, emit)
    }
    res.end()
  } catch (reason) {
    const message = reason.name === 'AbortError' ? 'Request cancelled.' : String(reason.message || reason)
    if (!res.headersSent) return res.status(502).json({ error: message.slice(0, 300) })
    if (!res.destroyed) {
      res.write(JSON.stringify({ type: 'error', message: message.slice(0, 300) }) + '\n')
      res.end()
    }
  }
})

app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown endpoint.' }))
// Only build-generated public assets receive immutable HTTP caching.
app.use('/assets',express.static(fileURLToPath(new URL('../dist/assets/',import.meta.url)),{
  dotfiles:'deny',maxAge:'1y',immutable:true,index:false,
  setHeaders(response,filePath){
    if(/-[A-Za-z0-9_-]{8,}\.(?:js|css|svg|png|webp|woff2)$/.test(filePath))
      response.setHeader('Cache-Control','public, max-age=31536000, immutable')
  }
}))
app.use(express.static(fileURLToPath(new URL('../dist/', import.meta.url)), { dotfiles: 'deny' }))
app.listen(PORT, '127.0.0.1', () => {
  console.log('Workspace AI backend: http://127.0.0.1:' + PORT)
  console.log('ChatGPT tokens are stored outside the repository. API fallback: ' + (apiKey ? 'configured' : 'not configured'))
})
