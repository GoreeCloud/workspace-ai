import { readTodoistPage, TodoistReadError } from './todoist-reader.mjs'

// Serve only bounded, read-only Todoist data from an already-authorized local session.
export function attachTodoistReadRoute(app, {
  origins, getToken, getRevision, invalidate
}, reader = readTodoistPage) {
  app.get('/api/integrations/todoist/data', async (req, res) => {
    if ((req.headers.origin && !origins.has(req.headers.origin)) || req.headers['sec-fetch-site'] === 'cross-site') {
      return res.status(403).json({ error: 'Origin not allowed.' })
    }
    const token = getToken()
    if (!token) return res.status(409).json({ error: 'Connect Todoist before browsing.' })
    const revision = getRevision()
    try {
      const result = await reader(token, {
        resource: req.query.resource, projectId: req.query.projectId, cursor: req.query.cursor
      })
      if (revision !== getRevision()) return res.status(409).json({ error: 'Connection changed during Todoist loading.' })
      return res.json({
        resource: result.resource,
        results: result.results,
        nextCursor: result.nextCursor,
        readOnly: true
      })
    } catch (error) {
      if (revision !== getRevision()) return res.status(409).json({ error: 'Connection changed during Todoist loading.' })
      const status = error instanceof TodoistReadError ? error.status : 503
      if (status === 401) invalidate()
      return res.status(status).json({
        error: error instanceof TodoistReadError ? error.message : 'Todoist data could not be loaded.'
      })
    }
  })
}
