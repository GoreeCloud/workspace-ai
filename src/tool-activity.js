// Presentation-only records from verified chat stream events. Never an execution grant.
export const TOOL_ACTIVITY_LIMIT = 48
const statuses = new Set(['queued', 'running', 'completed', 'failed', 'cancelled', 'interrupted'])
const finalStatuses = new Set(['completed', 'failed', 'cancelled', 'interrupted'])
const clean = (value, limit) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, limit) : ''

export function normalizeToolEvent(event) {
  if (!event || event.type !== 'tool') return null
  if ([['id',100],['provider',80],['name',120]].some(([key,max]) => typeof event[key] !== 'string' || event[key].length > max)) return null
  const id = clean(event.id, 100)
  const provider = clean(event.provider, 80).toLowerCase()
  const name = clean(event.name, 120)
  const status = clean(event.status, 16).toLowerCase()
  if (!id || !provider || !name || !statuses.has(status)) return null
  if (!/^[a-zA-Z0-9._:-]+$/.test(id) || !/^[a-z0-9-]+$/.test(provider)) return null
  const label = clean(event.label, 140) || name.replace(/[._:-]+/g, ' ')
  return { id, provider, name, label, status }
}

export function updateToolActivity(items, event) {
  const current = Array.isArray(items) ? items.slice(0, TOOL_ACTIVITY_LIMIT) : []
  const tool = normalizeToolEvent(event)
  if (!tool) return current
  const index = current.findIndex(item => item.id === tool.id)
  if (index < 0) return current.length < TOOL_ACTIVITY_LIMIT ? [...current, tool] : current
  const previous = current[index]
  // A reused invocation ID cannot silently change tools or reverse a terminal state.
  if (previous.provider !== tool.provider || previous.name !== tool.name || finalStatuses.has(previous.status)) return current
  current[index] = { ...previous, status: tool.status }
  return current
}

export function settleToolActivity(items) {
  return Array.isArray(items) ? items.map(item =>
    item.status === 'queued' || item.status === 'running' ? { ...item, status: 'interrupted' } : item
  ) : []
}
