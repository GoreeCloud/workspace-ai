// Explicit human-reviewed project memory capture. Never save chat text automatically.
export const MEMORY_NOTE_MAX = 1200
export const PROJECT_MEMORY_MAX = 4000

export function memoryCandidateFromMessage(content) {
 if(typeof content!=='string')return ''
 return content.trim().slice(0,MEMORY_NOTE_MAX)
}
export function appendReviewedMemory(current,reviewed,chatTitle) {
 if(typeof current!=='string'||typeof reviewed!=='string')throw Error('Invalid project memory')
 const note=reviewed.trim()
 if(!note)throw Error('Enter a memory note to save.')
 if(note.length>MEMORY_NOTE_MAX)throw Error('Memory note exceeds 1,200 characters.')
 const title=typeof chatTitle==='string'?chatTitle.replace(/[\r\n]/g,' ').slice(0,90).trim():'Conversation'
 const entry='From chat "'+(title||'Conversation')+'":\n'+note
 if(current.includes(entry))throw Error('This reviewed memory is already saved.')
 const combined=[current.trim(),entry].filter(Boolean).join('\n\n')
 if(combined.length>PROJECT_MEMORY_MAX)throw Error('Project memory is full (4,000 characters). Edit existing notes in Projects before saving.')
 return combined
}
