import {createHash,timingSafeEqual} from 'node:crypto'
import {createAgentScheduler,apiOnlyAgentInference} from './agent-scheduler.mjs'
const verify=(actual,entered)=>{
 if(typeof actual!=='string'||actual.length<32||typeof entered!=='string'||entered.length<32)return false
 return timingSafeEqual(createHash('sha256').update(actual).digest(),createHash('sha256').update(entered).digest())
}
export function attachAgentRoutes(app,origins,{getApiKey=()=>'',model='gpt-5-mini',scheduler}={}){
 const enabled=process.env.WORKSPACE_AI_ENABLE_SCHEDULED_AGENTS==='true'
 const key=process.env.WORKSPACE_AI_AGENT_OWNER_KEY||''
 const configured=enabled&&key.length>=32
 const service=scheduler||createAgentScheduler({infer:({agent,task})=>apiOnlyAgentInference({agent,task,apiKey:getApiKey(),model})})
 const authorized=(req,res,next)=>{
  if(!configured)return res.status(503).json({error:'Scheduled agents are disabled by default.'})
  if(!origins.has(req.headers.origin))return res.status(403).json({error:'Local origin required'})
  if(!verify(key,(req.headers.authorization||'').replace(/^Bearer /,'')))return res.status(401).json({error:'Owner authorization required'})
  next()
 }
 const route=handler=>(req,res)=>Promise.resolve().then(()=>handler(req)).then(data=>res.json(data)).catch(e=>res.status(400).json({error:String(e.message||e).slice(0,220)}))
 app.get('/api/agents/status',(_req,res)=>res.json({enabled:configured,apiReady:Boolean(getApiKey()),maxJobs:20,minIntervalMinutes:60,execution:'API-only, no tools'}))
 app.get('/api/agents/schedules',authorized,route(()=>service.list()))
 app.post('/api/agents/schedules',authorized,route(req=>service.add(req.body)))
 app.patch('/api/agents/schedules/:id',authorized,route(req=>service.change(req.params.id,req.body)))
 app.delete('/api/agents/schedules/:id',authorized,route(async req=>{await service.remove(req.params.id);return {deleted:true}}))
 app.post('/api/agents/schedules/:id/run',authorized,route(req=>{
  if(!getApiKey())throw Error('Environment OpenAI API key required')
  return service.run(req.params.id)
 }))
 if(configured){
  const timer=setInterval(()=>{if(getApiKey())service.tick().catch(()=>{})},60000)
  timer.unref?.()
 }
 return {enabled:configured,service}
}
