// Immutable, response-identity-scoped updates. An old stream must never write
// into another reply after a chat is restored, replaced, or reordered.
export function updateStreamingReply(chats, chatId, replyId, update) {
  if (!Array.isArray(chats) || typeof chatId !== 'string' || typeof replyId !== 'string' || typeof update !== 'function') {
    throw Error('Invalid streamed reply update.')
  }
  const index = chats.findIndex(chat => chat?.id === chatId)
  if (index < 0) throw Error('The conversation changed while generating. Reload to review saved messages.')
  const chat = chats[index]
  const messages = chat.messages
  if (!Array.isArray(messages) || messages.length === 0) throw Error('The streamed reply is missing. Reload to review saved messages.')
  const reply = messages[messages.length - 1]
  if (reply?.id !== replyId || reply.role !== 'assistant' || reply.pending !== true) {
    throw Error('The streamed reply is no longer current. Reload to review saved messages.')
  }
  const changed = update(reply)
  if (!changed || typeof changed !== 'object' || changed.id !== replyId || changed.role !== 'assistant' || typeof changed.content !== 'string') {
    throw Error('Invalid streamed reply update.')
  }
  const next = [...chats]
  next[index] = {...chat, messages: [...messages.slice(0, -1), changed], updatedAt: Date.now()}
  return next
}
