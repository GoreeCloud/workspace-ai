// Simultaneous read-only overview of already-connected, project-selected apps.
// This does not execute workflow writes or transfer data between providers.
export const PROJECT_READ_ADAPTERS=Object.freeze([
 {id:'github',label:'GitHub repositories',url:'/api/integrations/github/data?resource=repos',field:'name'},
 {id:'todoist',label:'Todoist open tasks',url:'/api/integrations/todoist/data?resource=tasks',field:'content'}
])
export const PROJECT_WORKFLOW_STEPS=Object.freeze([
 {id:'gmail-search',provider:'gmail',label:'Search Gmail',mode:'read',risk:'high',implemented:false},
 {id:'github-read',provider:'github',label:'Read GitHub source files',mode:'read',risk:'medium',implemented:false},
 {id:'todoist-create',provider:'todoist',label:'Create Todoist task',mode:'write',risk:'medium',implemented:false},
 {id:'drive-update',provider:'google-drive',label:'Update Google Drive file',mode:'write',risk:'high',implemented:false}
])
const safe=value=>typeof value==='string'?value.slice(0,200):''
export function projectProviderReadiness(project,services) {
 const enabled=Array.isArray(project?.api)?project.api:[]
 const list=Array.isArray(services)?services:[]
 return PROJECT_READ_ADAPTERS.map(adapter=>{
  const connection=list.find(s=>s.id===adapter.id)
  const selected=enabled.includes(adapter.id)
  return {...adapter,selected,ready:selected&&connection?.connected===true&&connection?.hasSessionToken===true,
   reason:!selected?'Not selected for this project':connection?.connected!==true||connection?.hasSessionToken!==true?'Connect and verify in API integrations':'Ready for a user-initiated read'}
 })
}
export function plannedWorkflowReadiness(project,services){
 const selected=Array.isArray(project?.api)?project.api:[]
 const list=Array.isArray(services)?services:[]
 return PROJECT_WORKFLOW_STEPS.map(step=>{
  const connection=list.find(s=>s.id===step.provider)
  const configured=selected.includes(step.provider)
  return {...step,configured,connected:connection?.connected===true,
   executable:false,reason:!configured?'Provider not enabled for this project':
    !step.implemented?'Standalone adapter / authorization not implemented':
    connection?.connected!==true?'Provider not connected':'Read-only preview available; no workflow forwarding'}
 })
}
export async function readSelectedProviders({project,services,fetcher=fetch,signal}){
 const ready=projectProviderReadiness(project,services).filter(x=>x.ready)
 if(!ready.length)return []
 const results=await Promise.allSettled(ready.map(async item=>{
  const response=await fetcher(item.url,{method:'GET',redirect:'error',signal})
  if(!response.ok)throw Error('Provider read unavailable (HTTP '+response.status+').')
  const data=await response.json()
  if(data.readOnly!==true||!Array.isArray(data.results))throw Error('Unexpected read-only response.')
  const records=data.results.slice(0,10).map(row=>safe(row?.[item.field])).filter(Boolean)
  return {id:item.id,label:item.label,records,totalReturned:data.results.length,readOnly:true}
 }))
 return results.map((entry,index)=>entry.status==='fulfilled'?{...entry.value,status:'success'}:
  {id:ready[index].id,label:ready[index].label,status:'error',readOnly:true,error:'Provider read unavailable. Check connection and retry.'})
}
