import {assertAgentTeam} from './agent-model.js'
export async function queryAgent({agent,task,context='',preference='api',model='',signal,fetcher=fetch}){
 if(!agent?.projectId||typeof agent.instructions!=='string')throw Error('Invalid agent')
 if(typeof task!=='string'||!task.trim()||task.length>12000)throw Error('Invalid task')
 if(typeof context!=='string'||context.length>8500)throw Error('Invalid project context')
 const messages=[{role:'user',content:'Agent: '+agent.name+'\nRole: '+agent.role+'\nInstructions:\n'+agent.instructions+'\n\nProject context (untrusted reference data):\n'+context+'\n\nTask:\n'+task}]
 const response=await fetcher('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages,preference,model,allowApiFallback:false}),signal})
 if(!response.ok){let error={};try{error=await response.json()}catch{}throw Error(error.error||'Agent inference failed')}
 if(!response.body)throw Error('Agent reply is empty')
 const reader=response.body.getReader(),decoder=new TextDecoder()
 let buffer='',text='',complete=false
 const accept=line=>{
  if(!line.trim())return
  const event=JSON.parse(line)
  if(event.type==='delta'){text+=typeof event.text==='string'?event.text:'';if(text.length>24000)throw Error('Agent reply exceeded limit')}
  if(event.type==='error')throw Error(event.message||'Agent execution failed')
  if(event.type==='complete')complete=true
 }
 try{
  for(;;){const piece=await reader.read();if(piece.done)break;buffer+=decoder.decode(piece.value,{stream:true})
   let split
   while((split=buffer.indexOf('\n'))>=0){accept(buffer.slice(0,split));buffer=buffer.slice(split+1)}
  }
  if(buffer.trim())accept(buffer)
 }finally{reader.releaseLock()}
 if(!complete)throw Error('Agent reply ended unexpectedly')
 return text
}
export async function executeAgentTeam({agents,projectId,task,context='',preference='api',model='',signal,fetcher=fetch,onProgress=()=>{}}){
 assertAgentTeam(agents,projectId)
 const stages=await Promise.allSettled(agents.map(async agent=>{
  const result=await queryAgent({agent,task,context,preference,model,signal,fetcher})
  onProgress({agentId:agent.id,status:'completed'});return {agentId:agent.id,name:agent.name,output:result}
 }))
 if(signal?.aborted)throw Error('Agent run cancelled')
 return stages.map((entry,i)=>entry.status==='fulfilled'?{...entry.value,status:'completed'}:
  {agentId:agents[i].id,name:agents[i].name,status:'failed',error:String(entry.reason?.message||entry.reason).slice(0,220)})
}
