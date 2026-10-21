// Display history is retained when a chat moves; only the active segment goes to the model.
export function conversationContextStart(chat) {
 const messages=Array.isArray(chat?.messages)?chat.messages:[]
 if(chat?.contextStart===undefined)return 0 // Pre-boundary local chats.
 const start=chat.contextStart
 // Corrupt boundary metadata must not restore old conversation history to AI context.
 return Number.isSafeInteger(start)&&start>=0&&start<=messages.length?start:messages.length
}
export function moveChatToProject(chat,projectId,now=Date.now()) {
 if(!chat||typeof chat!=='object'||!Array.isArray(chat.messages))throw Error('Invalid conversation')
 const nextId=typeof projectId==='string'&&projectId.trim()?projectId:null
 const oldId=typeof chat.projectId==='string'&&chat.projectId.trim()?chat.projectId:null
 if(oldId===nextId)return chat
 return {...chat,projectId:nextId,contextStart:chat.messages.length,updatedAt:now}
}
export function scopedChatMessages(chat) {
 const messages=Array.isArray(chat?.messages)?chat.messages:[]
 return messages.slice(conversationContextStart(chat)).filter(m=>m&&!m.error&&
  (m.role==='user'||m.role==='assistant')&&typeof m.content==='string'&&m.content.trim())
}
