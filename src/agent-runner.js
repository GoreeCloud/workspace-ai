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
 const maxStreamBytes=128*1024,maxLineLength=32768,maxReplyLength=24000
 let buffer='',text='',complete=false,received=0
 const accept=line=>{
  if(!line.trim())return
  if(line.length>maxLineLength)throw Error('Agent stream event exceeded limit')
  const event=JSON.parse(line)
  if(event.type==='delta'){
   const addition=typeof event.text==='string'?event.text:''
   if(text.length+addition.length>maxReplyLength)throw Error('Agent reply exceeded limit')
   text+=addition
  }
  if(event.type==='error')throw Error(String(event.message||'Agent execution failed').slice(0,220))
  if(event.type==='complete')complete=true
 }
 try{
  for(;;){
   if(signal?.aborted)throw Error('Agent run cancelled')
   const piece=await reader.read()
   if(piece.done)break
   received+=piece.value?.byteLength||0
   if(received>maxStreamBytes)throw Error('Agent stream exceeded safety limit')
   buffer+=decoder.decode(piece.value,{stream:true})
   let split
   while((split=buffer.indexOf('\n'))>=0){
    if(split>maxLineLength)throw Error('Agent stream event exceeded limit')
    accept(buffer.slice(0,split));buffer=buffer.slice(split+1)
   }
   if(buffer.length>maxLineLength)throw Error('Agent stream event exceeded limit')
  }
  buffer+=decoder.decode()
  if(buffer.trim())accept(buffer)
  if(!complete)throw Error('Agent reply ended unexpectedly')
  return text
 }catch(error){
  // Stop reading a failed/oversized response; otherwise a provider can keep
  // streaming and consuming quota after the UI has rejected its output.
  void reader.cancel(error).catch(()=>{})
  throw error
 }finally{reader.releaseLock()}
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
