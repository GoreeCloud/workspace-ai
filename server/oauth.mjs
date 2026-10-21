import { createHash, randomBytes } from 'node:crypto'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { readProfile, updateProfile } from './storage.mjs'
import {accountId,refreshSavedAccount,removeAccount} from './account-profiles.mjs'

export const AUTH_BASE = 'https://auth.openai.com'
export const RESOURCE = 'https://api.openai.com/v1'
export const SCOPES = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct'
const jwks = createRemoteJWKSet(new URL(AUTH_BASE + '/.well-known/jwks.json'))
const pending = new Map()
const refreshPending=new Map()

export function makeAttempt({ hostId, callback, current, allowOtherAccount=false }) {
  const state = randomBytes(32).toString('base64url')
  const nonce = randomBytes(32).toString('base64url')
  const verifier = randomBytes(48).toString('base64url')
  const clientId = current?.client_id || 'dynamic_agent_client'
  const query = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: callback,
    scope: SCOPES,
    resource: RESOURCE,
    state,
    nonce,
    code_challenge_method: 'S256',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    ext_agent_host_id: hostId
  })
  if (!current?.client_id) query.set('agent_name_hint', 'GoreeCloud Workspace AI')
  if (!allowOtherAccount && current?.email) query.set('login_hint', current.email)
  if (!allowOtherAccount && current?.id_token) query.set('id_token_hint', current.id_token)
  for (const [key, attempt] of pending) if (attempt.created < Date.now() - 600_000) pending.delete(key)
  pending.set(state, { nonce, verifier, callback, clientId, subject: allowOtherAccount?null:current?.subject, created: Date.now() })
  return AUTH_BASE + '/api/accounts/authorize?' + query.toString()
}

export function consumeAttempt(state) {
  const attempt = pending.get(state)
  pending.delete(state)
  if (!attempt || attempt.created < Date.now() - 600_000) throw new Error('Sign-in expired or state mismatch. Try again.')
  return attempt
}

async function tokenRequest(values) {
  const response = await fetch(AUTH_BASE + '/api/accounts/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(values),
    signal: AbortSignal.timeout(20_000)
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error('OpenAI token exchange failed (' + response.status + '): ' + (body.error || 'unknown error'))
  return body
}

export async function exchangeCode({ code, issuedId, attempt }) {
  const clientId = attempt.clientId === 'dynamic_agent_client' ? issuedId : attempt.clientId
  if (!clientId || !/^oaiapp_[\w-]+$/.test(clientId)) throw new Error('OpenAI did not issue a valid application client ID.')
  if (attempt.clientId !== 'dynamic_agent_client' && issuedId && issuedId !== clientId) {
    throw new Error('OAuth client mismatch.')
  }
  const token = await tokenRequest({
    grant_type: 'authorization_code',
    client_id: clientId,
    code,
    code_verifier: attempt.verifier,
    redirect_uri: attempt.callback,
    resource: RESOURCE
  })
  if (!token.id_token || !token.access_token) throw new Error('OpenAI did not return the required tokens.')
  const { payload } = await jwtVerify(token.id_token, jwks, { issuer: AUTH_BASE, audience: clientId })
  if (payload.nonce !== attempt.nonce || !payload.sub) throw new Error('OpenAI identity validation failed.')
  if (attempt.subject && payload.sub !== attempt.subject) throw new Error('Signed-in ChatGPT account does not match the selected connection.')
  return {
    subject: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : null,
    display_name: typeof payload.name==='string'&&payload.name.trim()?payload.name.trim().slice(0,90):null,
    username: typeof payload.preferred_username==='string'&&payload.preferred_username.trim()?payload.preferred_username.trim().slice(0,90):null,
    client_id: clientId,
    id_token: token.id_token,
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    scopes: typeof token.scope === 'string' ? token.scope.split(/\s+/) : [],
    expires_at: Date.now() + Number(token.expires_in || 3600) * 1000
  }
}

export async function getPlanToken(expectedAccountId) {
  const profile = await readProfile()
  const account = profile.account
  if (expectedAccountId!==undefined && (account?.subject?accountId(account.subject):null)!==expectedAccountId)throw Error('Account changed; reload before using the plan')
  if (!account?.access_token || !account.scopes?.includes('chatgpt.tokens.use.direct')) return null
  if (account.expires_at > Date.now() + 120_000) return account.access_token
  if (!account.refresh_token) return null
  if (!refreshPending.has(account.subject)) {
    const task = (async () => {
      const newer = await tokenRequest({
        grant_type: 'refresh_token',
        client_id: account.client_id,
        refresh_token: account.refresh_token,
        resource: RESOURCE
      })
      const updated = {
        ...account,
        access_token: newer.access_token,
        refresh_token: newer.refresh_token || account.refresh_token,
        scopes: typeof newer.scope === 'string' ? newer.scope.split(/\s+/) : account.scopes,
        expires_at: Date.now() + Number(newer.expires_in || 3600) * 1000
      }
      if (!updated.access_token) throw new Error('Token refresh did not return an access token.')
      if (newer.id_token) {
        const {payload} = await jwtVerify(newer.id_token,jwks,{issuer:AUTH_BASE,audience:account.client_id})
        if (payload.sub !== account.subject) throw new Error('Identity mismatch during token renewal.')
        updated.id_token = newer.id_token
      }
      // An in-flight refresh must never overwrite a newly signed-in account.
      let applied=false
      await updateProfile(previous => {
        const next=refreshSavedAccount(previous,account,updated)
        applied=next!==previous
        return next
      })
      if(!applied)throw Error('Account changed during token renewal.')
      return updated.access_token
    })().finally(() => { refreshPending.delete(account.subject) })
    refreshPending.set(account.subject,task)
  }
  return refreshPending.get(account.subject)
}

export async function disconnectAccount(expectedAccountId) {
  const profile = await readProfile()
  const account = profile.account
  if(!account?.subject||accountId(account.subject)!==expectedAccountId)throw Error('Active account changed before sign out')
  let revoked = true
  if (account?.refresh_token) {
    try {
      const response = await fetch(AUTH_BASE + '/api/accounts/oauth/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          token: account.refresh_token,
          token_type_hint: 'refresh_token',
          client_id: account.client_id
        }),
        signal: AbortSignal.timeout(10_000)
      })
      revoked = response.ok
    } catch { revoked = false }
  }
  await updateProfile(previous=>{
    if(previous.account?.subject!==account.subject||previous.account?.refresh_token!==account.refresh_token)throw Error('Account changed while signing out')
    return removeAccount(previous,account.subject)
  })
  return revoked
}
