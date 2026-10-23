import { fileURLToPath } from 'node:url'
import 'dotenv/config'
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
import {resolveIngress} from './ingress-config.mjs'
import {loadPrivateGatewayToken, matchesPrivateGatewayToken, GATEWAY_TOKEN_HEADER, GATEWAY_VERSION_HEADER, GATEWAY_CONTRACT_VERSION} from './private-gateway-auth.mjs'

const app = express()
const {port: PORT, privateDev, bindHost, clientOrigin, allowedHosts, allowedOrigins} = resolveIngress()
const gatewayToken = loadPrivateGatewayToken()
const environmentApiKey = process.env.OPENAI_API_KEY?.trim() || ''
let apiKey = environmentApiKey
let apiKeySource = environmentApiKey ? 'environment' : null
const apiModel = process.env.OPENAI_API_MODEL || 'gpt-5-mini'
const callback = clientOrigin + '/auth/callback'
const endpoint = 'https://api.openai.com/v1'
const cooldownCodes = new Set([
  'subscription_sharing_usage_limit_exceeded',
  'subscription_sharing_usage_unavailable',
  'subscription_sharing_user_not_eligible',
  'subscription_sharing_user_unavailable'
])

// Express 4 does not forward rejected async handlers to error middleware.
// A damaged or inaccessible private profile must fail closed for this request,
// rather than become an unhandled rejection that terminates the local server.
const safeRoute = handler => (req, res, next) => {
  Promise.resolve().then(() => handler(req, res, next)).catch(next)
}

app.disable('x-powered-by')
app.use((req, res, next) => {
  if (gatewayToken && (req.headers[GATEWAY_VERSION_HEADER] !== GATEWAY_CONTRACT_VERSION ||
      !matchesPrivateGatewayToken(gatewayToken, req.headers[GATEWAY_TOKEN_HEADER]))) {
    return res.status(403).json({ error: 'Gateway credential rejected.' })
  }
  const host = req.headers.host
  if (!allowedHosts.has(host)) return res.status(403).json({ error: 'Unrecognized workspace host.' })
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'")
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (privateDev && !req.headers.origin) return res.status(403).json({ error: 'Origin required for private development writes.' })
    if (req.headers.origin && !allowedOrigins.has(req.headers.origin)) return res.status(403).json({ error: 'Origin not allowed.' })
  }
  next()
})
app.use('/api/chat',express.json({limit:'520kb'}))
app.use(express.json({ limit: '90kb' }))
const localOrigins=allowedOrigins
const mcpApproval=attachMcpApprovalRoutes(app,localOrigins)
const mcpIntegration=attachIntegrationRoutes(app,localOrigins,{onMcpChange:provider=>mcpApproval.revokeProvider(provider)})
attachMcpLiveRoutes(app,localOrigins,{broker:mcpApproval,...mcpIntegration,providerReady:mcpIntegration.isMcpReady})
attachGoogleRoutes(app,localOrigins)
attachAgentRoutes(app,localOrigins,{getApiKey:()=>environmentApiKey,model:apiModel})
attachAccountSyncRelay(app,localOrigins)
const credentialSettings = attachCredentialSettings(app, {
  allowedOrigins: localOrigins,
  getCredential: () => apiKey,
  setCredential: value => { apiKey = value; apiKeySource = 'session' },
  clearCredential: () => { apiKey = environmentApiKey; apiKeySource = environmentApiKey ? 'environment' : null },
  verifyCredential: verifyApiKey
})

app.get('/api/status', safeRoute(async (_req, res) => {
  res.json({ ...publicStatus(await readProfile(), Boolean(apiKey)), apiKeySource, apiVerification: credentialSettings.getVerification() })
}))

app.get('/api/auth/start', safeRoute(async (req, res) => {
  const profile = await readProfile()
  const url = makeAttempt({
    hostId: await getHostId(), callback,
    current: profile.account?.client_id ? profile.account : null,
    allowOtherAccount:req.query.mode==='add'
  })
  res.json({ url })
}))

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
  } catch (reason) {
    error = reason instanceof Error ? reason.message : 'Unknown authorization error.'
  }
  // Never redirect tokens, codes, or the OAuth URL back into browser storage.
  res.redirect(303, clientOrigin + '/?auth=' + (error ? 'failed' : 'connected'))
})

app.post('/api/auth/disconnect', async (req, res) => {
  try{
    const revoked=await disconnectAccount(req.body?.accountId)
    res.json({revoked,warning:revoked?null:'Local credentials cleared; remote revocation was not confirmed. Disconnect this app in ChatGPT Settings.'})
  }catch(e){res.status(409).json({error:String(e.message).slice(0,190)})}
})
app.post('/api/auth/switch', async (req,res) => {
 try{
  const selected=req.body?.accountId
  if(!(selected===null||typeof selected==='string'))return res.status(400).json({error:'Select a saved account or local-only guest'})
  const updated=await updateProfile(profile=>selectAccount(profile,selected))
  return res.json({accountId:activeAccountId(updated),connected:Boolean(updated.account?.access_token)})
 }catch(e){return res.status(409).json({error:String(e.message).slice(0,190)})}
})
function verifyActiveAccount(req,profile){
 const submitted=req.headers['x-workspace-account-id']||null
 return submitted===activeAccountId(profile)
}

app.get('/api/models', safeRoute(async (req, res) => {
  const p=await readProfile()
  if(!verifyActiveAccount(req,p))return res.status(409).json({error:'Active account changed. Reload the workspace.'})
  const models = []
  let error = null
  try {
    const token = await getPlanToken(activeAccountId(p))
    if (token) {
      const response = await fetch(endpoint + '/models', {
        headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(12000)
      })
      if (!response.ok) throw new Error('Plan model list unavailable (' + response.status + ')')
      const body = await response.json()
      const visible = Array.isArray(body.models) ? body.models : []
      for (const entry of visible) {
        if (entry.visibility === 'list' && validModel(entry.slug)) {
          models.push({ slug: entry.slug, name: entry.display_name || entry.slug })
        }
      }
    }
  } catch (reason) { error = reason.message }
  res.json({
    planModels: models,
    apiModel: apiKey ? apiModel : null,
    error
  })
}))

function normalizedError(response, json) {
  return {
    status: response.status,
    code: json?.error?.code || '',
    message: String(json?.error?.message || json?.detail || ('OpenAI returned HTTP ' + response.status)).slice(0, 300),
    requestId: response.headers.get('x-request-id') || undefined
  }
}

app.post('/api/chat', safeRoute(async (req, res) => {
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
      body: JSON.stringify({ model, input: images.length?multimodalChatInput(messages,images):messages, store: false, stream: true }),
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
}))

app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown endpoint.' }))
app.use((error, _req, res, _next) => {
  // Do not return or log parser text, OAuth tokens, provider payloads or file
  // paths from private profile failures. Only a bounded diagnostic type leaves
  // the request boundary; the original profile remains untouched for recovery.
  const category = typeof error?.code === 'string' && /^[A-Z_]{2,32}$/.test(error.code)
    ? error.code : 'UNEXPECTED'
  console.error(`Workspace AI local request failed (${category}).`)
  if (res.headersSent) {
    if (!res.destroyed) res.end()
    return
  }
  if (error?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON request body.' })
  }
  if (error?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body exceeds the size limit.' })
  }
  res.status(503).json({ error: 'Workspace AI cannot access required local state.' })
})
app.use(express.static(fileURLToPath(new URL('../dist/', import.meta.url)), { dotfiles: 'deny' }))
app.listen(PORT, bindHost, () => {
  console.log('Workspace AI backend: ' + clientOrigin + ' (binding ' + bindHost + ':' + PORT + ')')
  console.log('ChatGPT tokens are stored outside the repository. API fallback: ' + (apiKey ? 'configured' : 'not configured'))
})
