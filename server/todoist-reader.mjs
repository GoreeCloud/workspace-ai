// Read-only Todoist API v1 adapter. Fixed origins, bounded pages and response shaping.
export class TodoistReadError extends Error {
  constructor(status, message) { super(message); this.name = 'TodoistReadError'; this.status = status }
}
const clean = (value, max = 160) => typeof value === 'string' ? value.slice(0, max) : ''
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value)
export async function readTodoistPage(token, { resource = 'projects', projectId, cursor } = {}, fetchImpl = fetch) {
  if (typeof token !== 'string' || !token.trim()) throw new TodoistReadError(409, 'Connect Todoist before browsing.')
  if (!['projects', 'tasks'].includes(resource)) throw new TodoistReadError(400, 'Unsupported Todoist resource.')
  if (projectId !== undefined && (resource !== 'tasks' || !validId(projectId))) throw new TodoistReadError(400, 'Invalid Todoist project.')
  if (cursor !== undefined && (typeof cursor !== 'string' || cursor.length > 1024 || /[\x00-\x1f\x7f]/.test(cursor))) throw new TodoistReadError(400, 'Invalid page cursor.')
  const url = new URL('https://api.todoist.com/api/v1/' + resource)
  url.searchParams.set('limit', '50')
  if (projectId) url.searchParams.set('project_id', projectId)
  if (cursor) url.searchParams.set('cursor', cursor)
  let response
  try {
    response = await fetchImpl(url.toString(), {
      method:'GET', headers:{Authorization:'Bearer ' + token, Accept:'application/json'},
      redirect:'error', signal:AbortSignal.timeout(10000)
    })
  } catch {
    throw new TodoistReadError(503, 'Todoist is unreachable. Try again later.')
  }
  if (!response.ok) {
    if (response.status === 401) throw new TodoistReadError(401, 'Todoist rejected this session credential.')
    if (response.status === 403) throw new TodoistReadError(403, 'Todoist denied access to this resource.')
    throw new TodoistReadError(503, 'Todoist temporarily cannot return this list.')
  }
  let data
  try { data = await response.json() } catch { throw new TodoistReadError(502, 'Todoist returned an unreadable response.') }
  if (!Array.isArray(data?.results)) throw new TodoistReadError(502, 'Todoist returned an unexpected response format.')
  const results = data.results.slice(0, 50).map(value => {
    if (resource === 'projects') return {
      id: clean(value?.id, 80), name: clean(value?.name, 160), isFavorite: value?.is_favorite === true
    }
    return {
      id: clean(value?.id, 80), projectId: clean(value?.project_id, 80),
      content: clean(value?.content, 500), priority: Number.isInteger(value?.priority) ? value.priority : 1,
      dueDate: clean(value?.due?.date, 40)
    }
  }).filter(item => item.id)
  const nextCursor = typeof data.next_cursor === 'string' && data.next_cursor.length <= 1024 ? data.next_cursor : null
  return { resource, results, nextCursor, readOnly:true }
}
