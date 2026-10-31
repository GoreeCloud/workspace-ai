import { randomBytes } from 'node:crypto'

export const HOSTED_COOKIE = '__Host-gcwa-browser'

export function cancelHostedSessionRequests(session) {
  for (const controller of session?.activeRequests || []) controller.abort()
  session?.activeRequests?.clear()
}
const COOKIE_TTL_SECONDS = 2 * 60 * 60
const COOKIE_TTL_MS = COOKIE_TTL_SECONDS * 1000
const MAX_SESSIONS = 64
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

export function createHostedCredentialSessions({
  now = () => Date.now(),
  generate = () => randomBytes(32).toString('base64url'),
  maxSessions = MAX_SESSIONS,
  idleMs = COOKIE_TTL_MS,
  lifetimeMs = COOKIE_TTL_MS
} = {}) {
  const sessions = new Map()

  function reap() {
    const clock = now()
    for (const [token, session] of sessions) {
      if (clock - session.touchedAt >= idleMs || clock < session.touchedAt || clock - session.startedAt >= lifetimeMs) {
        cancelHostedSessionRequests(session)
        session.key = ''
        sessions.delete(token)
      }
    }
  }

  function tokenFrom(req) {
    const header = req.headers?.cookie
    if (typeof header !== 'string' || header.length > 4096) return null
    const found = []
    for (const part of header.split(';')) {
      const index = part.indexOf('=')
      if (index < 0) continue
      if (part.slice(0, index).trim() === HOSTED_COOKIE) found.push(part.slice(index + 1).trim())
    }
    return found.length === 1 && TOKEN_PATTERN.test(found[0]) ? found[0] : null
  }

  function find(req) {
    reap()
    const token = tokenFrom(req)
    const session = token ? sessions.get(token) : null
    if (session) session.touchedAt = now()
    return session || null
  }

  function begin(req, res) {
    const current = find(req)
    if (current) return current
    if (sessions.size >= maxSessions) return null
    // A new browser session is created only by GET /api/status, after
    // existing gateway, Host and origin checks. Writes never mint sessions.
    const token = generate()
    if (typeof token !== 'string' || !TOKEN_PATTERN.test(token) || sessions.has(token)) return null
    const session = { key: '', verification: {state:'untested',checkedAt:null}, revision:0, activeRequests:new Set(), startedAt:now(), touchedAt:now() }
    sessions.set(token, session)
    res.setHeader('Set-Cookie', HOSTED_COOKIE + '=' + token + '; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=' + COOKIE_TTL_SECONDS)
    return session
  }

  return { begin, find }
}
