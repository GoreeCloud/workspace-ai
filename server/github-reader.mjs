// Read-only GitHub REST browser scoped to the authorized GoreeCloud identity.
export class GitHubReadError extends Error {
  constructor(status, message) { super(message); this.name = 'GitHubReadError'; this.status = status }
}
const clean = (value, limit = 240) => typeof value === 'string' ? value.slice(0, limit) : ''
const validRepo = name => typeof name === 'string' && /^[A-Za-z0-9_.-]{1,100}$/.test(name) && name !== '.' && name !== '..'

export async function readGitHubPage(token, { resource = 'repos', repo, page = 1 } = {}, fetchImpl = fetch) {
  if (typeof token !== 'string' || !token.trim()) throw new GitHubReadError(409, 'Connect the GoreeCloud GitHub account first.')
  if (token.length > 2048 || /\s/.test(token)) throw new GitHubReadError(400, 'Invalid GitHub credential.')
  if (!['repos', 'issues', 'pulls'].includes(resource)) throw new GitHubReadError(400, 'Unsupported GitHub resource.')
  if ((resource === 'repos' && repo !== undefined) || (resource !== 'repos' && !validRepo(repo))) {
    throw new GitHubReadError(400, 'Invalid repository selection.')
  }
  const pageText = String(page)
  if (!/^(?:[1-9]|[1-9][0-9]|100)$/.test(pageText)) throw new GitHubReadError(400, 'Invalid page number.')
  const number = Number(pageText)
  const url = resource === 'repos'
    ? new URL('https://api.github.com/user/repos')
    : new URL('https://api.github.com/repos/GoreeCloud/' + encodeURIComponent(repo) + '/' + resource)
  url.searchParams.set('per_page', '50')
  url.searchParams.set('page', String(number))
  if (resource === 'repos') { url.searchParams.set('affiliation', 'owner'); url.searchParams.set('sort', 'updated') }
  else url.searchParams.set('state', 'open')
  let response
  try {
    response = await fetchImpl(url.toString(), {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: {
        Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'GoreeCloud-Workspace-AI'
      }
    })
  } catch {
    throw new GitHubReadError(503, 'GitHub could not be reached. Retry later.')
  }
  if (!response.ok) {
    if (response.status === 401) throw new GitHubReadError(401, 'GitHub rejected this session credential.')
    if (response.status === 403) throw new GitHubReadError(403, 'GitHub restricted access or rate-limited this request.')
    if (response.status === 404) throw new GitHubReadError(404, 'Repository was not found or is inaccessible.')
    throw new GitHubReadError(503, 'GitHub could not return this list.')
  }
  let data
  try { data = await response.json() } catch { throw new GitHubReadError(502, 'GitHub returned an unreadable response.') }
  if (!Array.isArray(data)) throw new GitHubReadError(502, 'GitHub returned an unexpected response format.')
  const results = data.slice(0, 50)
    .filter(x => resource !== 'repos' || x?.owner?.login === 'GoreeCloud')
    .filter(x => resource !== 'issues' || !x?.pull_request)
    .map(x => resource === 'repos' ? {
      name: clean(x?.name, 100), description: clean(x?.description, 200), isPrivate: x?.private === true,
      stars: Number.isSafeInteger(x?.stargazers_count) ? x.stargazers_count : 0,
      updatedAt: clean(x?.updated_at, 35)
    } : {
      number: Number.isSafeInteger(x?.number) ? x.number : 0,
      title: clean(x?.title, 250), updatedAt: clean(x?.updated_at, 35), state: clean(x?.state, 20)
    })
    .filter(x => resource === 'repos' ? validRepo(x.name) : x.number > 0)
  return {resource, repo: resource === 'repos' ? null : repo, results, nextPage: data.length === 50 && number < 100 ? number + 1 : null, readOnly: true}
}
