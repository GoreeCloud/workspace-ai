const initial = () => ({ state: 'untested', checkedAt: null })

export function attachCredentialSettings(app, {
  allowedOrigins, getCredential, setCredential, clearCredential, verifyCredential,
  sessionForRequest = null
}) {
  const local = {verification:initial(), revision:0}
  const scoped = (req, res) => {
    const state = sessionForRequest ? sessionForRequest(req) : local
    if (state) return state
    res.status(409).json({error:'Private browser session expired. Reload the workspace.'})
    return null
  }
  const authorized = (req, res) => {
    if (allowedOrigins.has(req.headers.origin)) return true
    res.status(403).json({ error: 'Origin not allowed.' })
    return false
  }

  app.post('/api/settings/credential', (req, res) => {
    if (!authorized(req, res)) return
    const scope = scoped(req, res)
    if (!scope) return
    const value = req.body?.key
    if (typeof value !== 'string' || value.trim().length < 16 || value.trim().length > 512 || /\s/.test(value.trim())) {
      return res.status(400).json({ error: 'Enter a valid API key without spaces.' })
    }
    setCredential(value.trim(), req)
    scope.verification = initial()
    scope.revision += 1
    res.json({ apiConfigured: true, verification: scope.verification })
  })

  app.delete('/api/settings/credential', (req, res) => {
    if (!authorized(req, res)) return
    const scope = scoped(req,res)
    if (!scope) return
    clearCredential(req)
    scope.verification = initial()
    scope.revision += 1
    res.json({ success: true, verification: scope.verification })
  })

  app.post('/api/settings/credential/verify', async (req, res) => {
    if (!authorized(req, res)) return
    const scope = scoped(req,res)
    if (!scope) return
    const key = getCredential(req)
    if (!key) return res.status(409).json({ error: 'Configure an API key before verifying it.' })
    const startedRevision = scope.revision
    let result
    try {
      result = await verifyCredential(key)
    } catch {
      result = { state: 'unavailable', message: 'The connection check could not be completed. Try again.' }
    }
    if (startedRevision !== scope.revision || (sessionForRequest && sessionForRequest(req) !== scope)) {
      return res.status(409).json({ error: 'The API key changed during verification. Try again.' })
    }
    const allowedStates = new Set(['verified', 'invalid', 'restricted', 'unavailable'])
    const state = allowedStates.has(result?.state) ? result.state : 'unavailable'
    const checkedAt = new Date().toISOString()
    scope.verification = { state, checkedAt }
    const message = typeof result?.message === 'string' ? result.message.slice(0, 240) : 'Verification could not be completed.'
    res.json({ verification: scope.verification, message })
  })

  return { getVerification: req => (sessionForRequest ? sessionForRequest(req)?.verification : local.verification) || initial() }
}
