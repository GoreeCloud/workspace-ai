export const PROMPT_MAX_COUNT=100
export const PROMPT_TITLE_MAX=100
export const PROMPT_CONTENT_MAX=12000

export function normalizePrompts(values,projectIds=[],strict=false){
 if(!Array.isArray(values)){if(strict)throw Error('Invalid prompt library');return []}
 if(strict&&values.length>PROMPT_MAX_COUNT)throw Error('Prompt library exceeds 100 entries')
 const allowed=new Set(projectIds)
 const ids=new Set(),out=[]
 for(const item of values.slice(0,strict?values.length:PROMPT_MAX_COUNT)){
  const valid=item&&typeof item==='object'&&!Array.isArray(item)&&
   typeof item.id==='string'&&item.id.length>0&&item.id.length<=160&&
   typeof item.title==='string'&&item.title.trim().length>0&&item.title.length<=PROMPT_TITLE_MAX&&
   typeof item.content==='string'&&item.content.trim().length>0&&item.content.length<=PROMPT_CONTENT_MAX&&
   (item.projectId==null||(typeof item.projectId==='string'&&allowed.has(item.projectId)))&&
   !ids.has(item.id)
  if(!valid){if(strict)throw Error('Invalid or duplicate saved prompt');continue}
  const date=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:0
  ids.add(item.id)
  out.push({id:item.id,title:item.title.trim(),content:item.content,
   projectId:item.projectId||null,createdAt:date(item.createdAt),updatedAt:date(item.updatedAt)})
 }
 return out
}
export function promptsForContext(prompts,projectId){
 return prompts.filter(p=>p.projectId===null||(projectId&&p.projectId===projectId))
}
export function appendPromptDraft(draft,content){
 if(typeof draft!=='string'||typeof content!=='string'||!content.trim())throw Error('Invalid prompt')
 const joined=draft.trim()?draft.trimEnd()+'\n\n'+content:content
 if(joined.length>PROMPT_CONTENT_MAX)throw Error('Combined message exceeds the 12,000-character composer limit.')
 return joined
}
