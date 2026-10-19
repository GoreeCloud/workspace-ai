export function checkMessages(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 60) return null
  let total = 0
  const messages = []
  for (const item of value) {
    if (!item || !['user', 'assistant'].includes(item.role) || typeof item.content !== 'string') return null
    const content = item.content.trim()
    if (!content || content.length > 12000) return null
    total += content.length
    if (total > 50000) return null
    messages.push({ role: item.role, content })
  }
  if (messages.at(-1)?.role !== 'user') return null
  return messages
}

export function chooseRoute({ preference, planEnabled, apiConfigured, fallbackAllowed }) {
  if (preference === 'api') return apiConfigured ? 'api' : null
  if (preference === 'plan') return planEnabled ? 'plan' : null
  if (preference !== 'auto') return null
  if (planEnabled) return 'plan'
  return fallbackAllowed && apiConfigured ? 'api' : null
}

export function validModel(model) {
  return typeof model === 'string' && /^[a-zA-Z0-9._:-]{1,90}$/.test(model)
}

export async function streamResponse(upstream, onEvent) {
  if (!upstream.body) throw new Error('OpenAI returned no response stream.')
  const reader = upstream.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let completed = false
  let failure = null
  const parse = (frame) => {
    const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
    if (!data || data === '[DONE]') return
    let event
    try { event = JSON.parse(data) } catch { return }
    if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
      onEvent({ type: 'delta', text: event.delta })
    } else if (event.type === 'response.completed') {
      completed = true
    } else if (event.type === 'response.failed' || event.type === 'response.incomplete' || event.type === 'error') {
      failure = event.response?.error?.code || event.error?.code || event.type
    }
  }
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split(/\r?\n\r?\n/)
      buffer = parts.pop() || ''
      for (const part of parts) parse(part)
      if (failure || completed) break
    }
    if (buffer) parse(buffer)
  } finally { await reader.cancel().catch(() => {}) }
  if (failure) throw new Error('OpenAI request failed: ' + failure)
  if (!completed) throw new Error('OpenAI stream ended before response.completed.')
  onEvent({ type: 'complete' })
}
