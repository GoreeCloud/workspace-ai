export function attachCredentialSettings(app, { allowedOrigins, setCredential, clearCredential }) {
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
    res.json({ apiConfigured: true })
  })
  app.delete('/api/settings/credential', (req, res) => {
    if (!authorized(req, res)) return
    clearCredential()
    res.json({ success: true })
  })
}
