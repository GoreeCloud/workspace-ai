import {readGitHubPage, GitHubReadError} from './github-reader.mjs'

// The browser controls validated resources only; credentials and upstream host stay server-side.
export function attachGitHubReadRoute(app, {origins, getToken, getRevision, invalidate}, reader = readGitHubPage) {
  app.get('/api/integrations/github/data', async (req, res) => {
    if ((req.headers.origin && !origins.has(req.headers.origin)) || req.headers['sec-fetch-site'] === 'cross-site') {
      return res.status(403).json({error: 'Origin not allowed.'})
    }
    const token = getToken()
    if (!token) return res.status(409).json({error: 'Connect the GoreeCloud GitHub account before browsing.'})
    const revision = getRevision()
    try {
      const result = await reader(token, {resource: req.query.resource, repo: req.query.repo, page: req.query.page})
      if (revision !== getRevision()) return res.status(409).json({error: 'Connection changed while loading GitHub.'})
      return res.json({resource: result.resource, repo: result.repo, results: result.results, nextPage: result.nextPage, readOnly: true})
    } catch (error) {
      if (revision !== getRevision()) return res.status(409).json({error: 'Connection changed while loading GitHub.'})
      const status = error instanceof GitHubReadError ? error.status : 503
      if (status === 401) invalidate()
      return res.status(status).json({error: error instanceof GitHubReadError ? error.message : 'GitHub data could not be loaded.'})
    }
  })
}
