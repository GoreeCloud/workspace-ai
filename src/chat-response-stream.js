// A bounded reader for the local backend's newline-delimited JSON chat stream.
// Provider input and network chunk boundaries are not trusted as event bounds.
const MAX_LINE_CHARS = 256 * 1024
const MAX_RESPONSE_CHARS = 2 * 1024 * 1024

export async function consumeChatResponse(stream, onEvent) {
  if (!stream || typeof stream.getReader !== 'function') throw Error('The server returned no stream.')
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let received = 0
  let textReceived = false
  let completed = false
  let failed = true
  const parseLine = line => {
    if (!line.trim()) return
    if (completed) throw Error('The server sent events after response completion.')
    let event
    try { event = JSON.parse(line) } catch { throw Error('The server sent an invalid response event.') }
    if (!event || typeof event !== 'object' || Array.isArray(event)) throw Error('The server sent an invalid response event.')
    if (event.type === 'error') throw Error(typeof event.message === 'string' ? event.message.slice(0, 300) : 'Streaming error.')
    if (event.type === 'complete') { completed = true; return }
    if (event.type === 'delta') {
      if (typeof event.text !== 'string') throw Error('The server sent an invalid text event.')
      if (event.text.length) textReceived = true
      onEvent(event)
      return
    }
    if (event.type === 'meta') {
      if (typeof event.provider !== 'string' || typeof event.model !== 'string') throw Error('The server sent invalid model information.')
      onEvent(event)
      return
    }
    throw Error('The server sent an unknown response event.')
  }
  const receive = text => {
    received += text.length
    if (received > MAX_RESPONSE_CHARS) throw Error('The response exceeded the browser safety limit.')
    buffer += text
    let newline = buffer.indexOf('\n')
    while (newline !== -1) {
      if (newline > MAX_LINE_CHARS) throw Error('A response event exceeded the browser safety limit.')
      parseLine(buffer.slice(0, newline).replace(/\r$/, ''))
      buffer = buffer.slice(newline + 1)
      newline = buffer.indexOf('\n')
    }
    if (buffer.length > MAX_LINE_CHARS) throw Error('A response event exceeded the browser safety limit.')
  }
  try {
    while (true) {
      const {done, value} = await reader.read()
      if (done) break
      receive(decoder.decode(value, {stream: true}))
    }
    receive(decoder.decode())
    if (buffer.trim()) parseLine(buffer)
    if (!completed) throw Error('The response ended unexpectedly. Your partial answer was preserved.')
    if (!textReceived) throw Error('The model returned an empty response. Your question was preserved.')
    failed = false
  } finally {
    if (failed) await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

// A tab close or process crash cannot complete a provider response. Never
// present an unfinished assistant message as if it were successful.
export function recoverInterruptedChats(chats) {
  if (!Array.isArray(chats)) return chats
  return chats.map(chat => {
    if (!Array.isArray(chat?.messages) || !chat.messages.some(message => message?.role === 'assistant' && message.pending === true)) return chat
    return {
      ...chat,
      messages: chat.messages.map(message => message?.role === 'assistant' && message.pending === true
        ? {...message, pending: false, error: true, content: message.content || 'Response interrupted. Your question is preserved; send another message to continue.'}
        : message)
    }
  })
}
