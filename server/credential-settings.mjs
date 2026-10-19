const initial = () => ({ state: 'untested', checkedAt: null })

export function attachCredentialSettings(app, {
  allowedOrigins, getCredential, setCredential, clearCredential, verifyCredential
}) {
  let verification = initial()
  let revision = 0
  const authorized = (req, res) => {
    if (allowedOrigins.has(req.headers.origin)) return true
    res.status(403).json({ error: 'Origin not allowed.' })
    return false
  }

  app.post('/api/settings/credential', (req, res) => {
    if (!authorized(req, res)) return
    const value = req.body?.key
    if (typeof value !== 'string' || value.trim().length < 16 || value.trim().length > 512 || /\s/.test(value.trim())) {
      return res.status(400).json({ error: 'Enter a valid API key without spaces.' })
    }
    setCredential(value.trim())
    verification = initial()
    revision += 1
    res.json({ apiConfigured: true, verification })
  })

  app.delete('/api/settings/credential', (req, res) => {
    if (!authorized(req, res)) return
    clearCredential()
    verification = initial()
    revision += 1
    res.json({ success: true, verification })
  })

  app.post('/api/settings/credential/verify', async (req, res) => {
    if (!authorized(req, res)) return
    const key = getCredential()
    if (!key) return res.status(409).json({ error: 'Configure an API key before verifying it.' })
    const startedRevision = revision
    let result
    try {
      result = await verifyCredential(key)
    } catch {
      result = { state: 'unavailable', message: 'The connection check could not be completed. Try again.' }
    }
    if (startedRevision !== revision) {
      return res.status(409).json({ error: 'The API key changed during verification. Try again.' })
    }
    const allowedStates = new Set(['verified', 'invalid', 'restricted', 'unavailable'])
    const state = allowedStates.has(result?.state) ? result.state : 'unavailable'
    const checkedAt = new Date().toISOString()
    verification = { state, checkedAt }
    const message = typeof result?.message === 'string' ? result.message.slice(0, 240) : 'Verification could not be completed.'
    res.json({ verification, message })
  })

  return { getVerification: () => verification }
}
