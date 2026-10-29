// GoreeCloud Workspace AI: operator-approved remote operations.
// Never expose arbitrary shell input to a model or browser. All commands come from
// a private, operator-owned, exact-match catalog.
import {createHash,randomUUID,timingSafeEqual} from 'node:crypto'
import {spawn} from 'node:child_process'
import {readFileSync,statSync,lstatSync} from 'node:fs'

const IDENT=/^[a-z][a-z0-9-]{1,47}$/
const HOST=/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i
const USER=/^[a-z_][a-z0-9_-]{0,31}$/i
const fail=(message,status=400)=>Object.assign(new Error(message),{status})
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)
const digest=s=>createHash('sha256').update(s).digest()
export function validateRemoteConfig(value){
 if(!object(value)||!Array.isArray(value.devices)||value.devices.length>32)throw fail('Invalid device catalog.')
 const seen=new Set()
 return {devices:value.devices.map(d=>{
  if(!object(d)||!IDENT.test(d.id)||seen.has(d.id)||typeof d.label!=='string'||!d.label.trim()||d.label.length>80)throw fail('Invalid device identity.')
  if(typeof d.host!=='string'||!HOST.test(d.host)||d.host.includes('..')||!USER.test(d.user)||!Number.isInteger(d.port||22)||(d.port||22)<1||(d.port||22)>65535)throw fail('Invalid device destination.')
  if(typeof d.keyFile!=='string'||!d.keyFile.startsWith('/')||typeof d.knownHostsFile!=='string'||!d.knownHostsFile.startsWith('/'))throw fail('Absolute SSH key and known-hosts paths required.')
  if(!Array.isArray(d.commands)||d.commands.length>40)throw fail('Invalid approved command list.')
  const cmdIds=new Set()
  const commands=d.commands.map(c=>{
   if(!object(c)||!IDENT.test(c.id)||cmdIds.has(c.id)||typeof c.label!=='string'||!c.label.trim()||c.label.length>100||typeof c.command!=='string'||!c.command.trim()||c.command.length>800||/[\0\r\n]/.test(c.command)||!['read','write'].includes(c.mode)||!['medium','high','critical'].includes(c.risk))throw fail('Invalid approved command.')
   if(c.mode==='write'&&c.risk==='medium')throw fail('Write commands must be high or critical risk.')
   cmdIds.add(c.id)
   return {id:c.id,label:c.label,command:c.command,mode:c.mode,risk:c.risk}
  })
  seen.add(d.id)
  return {id:d.id,label:d.label,host:d.host,user:d.user,port:d.port||22,keyFile:d.keyFile,knownHostsFile:d.knownHostsFile,commands}
 })}
}
export function loadRemoteConfig(path){
 if(!path)return {devices:[]}
 if(typeof path!=='string'||!path.startsWith('/'))throw fail('Private catalog path must be absolute.')
 const link=lstatSync(path),stat=statSync(path)
 if(!link.isFile()||!stat.isFile()||stat.size>65536||(stat.mode&0o077)!==0)throw fail('Private catalog requires a regular owner-only file under 64 KiB.')
 if(typeof process.getuid==='function'&&stat.uid!==process.getuid())throw fail('Private catalog owner does not match the running service.')
 return validateRemoteConfig(JSON.parse(readFileSync(path,'utf8')))
}
export function sshArguments(device,command){
 return ['-F','/dev/null','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','IdentitiesOnly=yes','-o','ForwardAgent=no','-o','ClearAllForwardings=yes','-o','PermitLocalCommand=no','-o','ConnectionAttempts=1','-o','ConnectTimeout=8','-o','LogLevel=ERROR','-o','UserKnownHostsFile='+device.knownHostsFile,'-i',device.keyFile,'-p',String(device.port),device.user+'@'+device.host,command]
}
export function runRemoteSsh(device,command,{runner=spawn,timeoutMs=30000,maxOutputBytes=32768}={}){
 return new Promise((resolve,reject)=>{
  let child,settled=false,output='',total=0,timer
  const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(result)}
  try{child=runner('ssh',sshArguments(device,command),{shell:false,stdio:['ignore','pipe','pipe'],env:{PATH:process.env.PATH||'/usr/bin:/bin',HOME:process.env.HOME||'/tmp'}})}catch{return reject(fail('SSH process unavailable.',502))}
  timer=setTimeout(()=>{child.kill('SIGKILL');finish(fail('Remote command timed out.',504))},timeoutMs)
  for(const stream of [child.stdout,child.stderr])stream?.on('data',part=>{
   total+=part.length
   if(total>maxOutputBytes){child.kill('SIGKILL');finish(fail('Remote output exceeded limit.',413))}
   else output+=part.toString('utf8')
  })
  child.on('error',()=>finish(fail('SSH executable or connection unavailable.',502)))
  child.on('close',code=>finish(null,{exitCode:Number.isInteger(code)?code:null,output}))
 })
}
export function validateBrowserArguments(name,args,{allowedHosts=[]}={}){
 if(!object(args))throw fail('Browser arguments must be an object.')
 const only=keys=>Object.keys(args).every(k=>keys.includes(k))
 const page=()=>Number.isInteger(args.pageId)&&args.pageId>=0&&args.pageId<=1000
 if(name==='list_pages'){if(!only([]))throw fail('Unexpected browser arguments.');return {}}
 if(name==='take_snapshot'){if(!only(['pageId'])||!page())throw fail('A valid page ID is required.');return {pageId:args.pageId}}
 if(name==='new_page'){
  if(!only(['url'])||typeof args.url!=='string'||args.url.length>1800)throw fail('Invalid page URL.')
  let url;try{url=new URL(args.url)}catch{throw fail('Invalid page URL.')}
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash||!HOST.test(url.hostname)||url.hostname==='localhost'||/^\d+\.\d+\.\d+\.\d+$/.test(url.hostname))throw fail('Only named public HTTPS pages are supported.')
  if(!allowedHosts.includes(url.hostname.toLowerCase()))throw fail('Page hostname is not operator-approved.',403)
  return {url:url.href}
 }
 if(name==='click'||name==='fill'){
  const keys=name==='click'?['pageId','uid']:['pageId','uid','value']
  if(!only(keys)||!page()||typeof args.uid!=='string'||!args.uid.trim()||args.uid.length>180)throw fail('Invalid browser element.')
  if(name==='fill'&&(typeof args.value!=='string'||args.value.length>1000))throw fail('Invalid input value.')
  return name==='click'?{pageId:args.pageId,uid:args.uid}:{pageId:args.pageId,uid:args.uid,value:args.value}
 }
 throw fail('Browser tool is not reviewed.',403)
}
export function createOperationsBroker({ownerKey='',config={devices:[]},now=Date.now,runSsh=runRemoteSsh,runBrowser=async()=>{throw fail('Chrome not configured.',409)},browserTools=[],chromeReady=false,allowedHosts=[],enabled=false,writesEnabled=false}={}){
 const validKey=typeof ownerKey==='string'&&ownerKey.length>=32
 const keyHash=validKey?digest(ownerKey):null
 const inventory=validateRemoteConfig(config),tickets=new Map(),audit=[]
 let running=false
 const log=(event,item={})=>{audit.push({event,at:new Date(now()).toISOString(),kind:item.kind||'',target:item.target||'',action:item.action||''});if(audit.length>200)audit.shift()}
 function authenticate(header){
  if(!validKey)throw fail('Owner key not configured.',503)
  if(typeof header!=='string'||!header.startsWith('Bearer '))throw fail('Owner authorization required.',401)
  const supplied=header.slice(7)
  if(supplied.length<32||supplied.length>2048||!timingSafeEqual(keyHash,digest(supplied)))throw fail('Owner authorization rejected.',401)
 }
 const list=()=>({configured:validKey,enabled:enabled&&validKey,writesEnabled:enabled&&writesEnabled,chromeReady:enabled&&chromeReady,allowedHosts:[...allowedHosts],devices:inventory.devices.map(d=>({id:d.id,label:d.label,commands:d.commands.map(c=>({id:c.id,label:c.label,command:c.command,mode:c.mode,risk:c.risk}))})),browserTools:chromeReady?browserTools:[]})
 const requireEnabled=()=>{if(!enabled||!validKey)throw fail('Remote Operations is disabled.',409)}
 function select(input){
  requireEnabled()
  if(!object(input)||!['ssh','chrome'].includes(input.kind)||typeof input.target!=='string'||typeof input.action!=='string')throw fail('Invalid operation.')
  if(input.kind==='ssh'){
   const device=inventory.devices.find(d=>d.id===input.target)
   const command=device?.commands.find(c=>c.id===input.action)
   if(!device||!command||input.args&&Object.keys(input.args).length)throw fail('Command not in catalog.',403)
   if(command.mode==='write'&&!writesEnabled)throw fail('Remote changes disabled.',409)
   return {kind:'ssh',target:device.id,action:command.id,description:command.command,mode:command.mode,risk:command.risk,device,command,args:{}}
  }
  if(!chromeReady||input.target!=='isolated-chrome')throw fail('Isolated Chrome not configured.',409)
  const tool=browserTools.find(t=>t.name===input.action)
  if(!tool)throw fail('Browser tool unavailable.',403)
  if(tool.mode==='write'&&!writesEnabled)throw fail('Browser changes disabled.',409)
  const args=validateBrowserArguments(tool.name,input.args||{},{allowedHosts})
  return {kind:'chrome',target:input.target,action:tool.name,description:tool.label||tool.name,mode:tool.mode,risk:tool.risk,args}
 }
 const prune=()=>{for(const [id,ticket] of tickets)if(ticket.expiresAt<=now()){tickets.delete(id);log('expired',ticket)}}
 function stage(input){
  prune()
  if(tickets.size>=24)throw fail('Too many pending operations.',429)
  const proposal=select(input),id=randomUUID(),nonce=randomUUID(),expiresAt=now()+300000
  const hash=createHash('sha256').update(JSON.stringify({id,nonce,expiresAt,kind:proposal.kind,target:proposal.target,action:proposal.action,args:proposal.args})).digest('hex')
  const ticket={...proposal,id,digest:hash,expiresAt,approved:false}
  tickets.set(id,ticket);log('staged',ticket)
  return {id,digest:hash,expiresAt,kind:ticket.kind,target:ticket.target,action:ticket.action,description:ticket.description,mode:ticket.mode,risk:ticket.risk,requiresCriticalConfirmation:ticket.risk==='critical'}
 }
 function lookup({id,digest}={}){
  prune()
  const ticket=tickets.get(id)
  if(!ticket||typeof digest!=='string'||ticket.digest!==digest)throw fail('Operation expired or changed.',409)
  return ticket
 }
 function approve(body){
  const ticket=lookup(body)
  if(body.confirmation!=='APPROVE')throw fail('Explicit APPROVE confirmation required.',403)
  if(ticket.risk==='critical'&&body.criticalConfirmation!=='CONFIRM CRITICAL')throw fail('Separate critical confirmation required.',403)
  ticket.approved=true;log('approved',ticket)
  return {approved:true,id:ticket.id,expiresAt:ticket.expiresAt}
 }
 async function execute(body){
  const ticket=lookup(body)
  if(!ticket.approved)throw fail('Approval required.',403)
  if(running)throw fail('Another operation is still running.',429)
  select({kind:ticket.kind,target:ticket.target,action:ticket.action,args:ticket.args})
  tickets.delete(ticket.id);running=true;log('claimed',ticket)
  try{
   const result=ticket.kind==='ssh'?await runSsh(ticket.device,ticket.command.command):await runBrowser(ticket.action,ticket.args)
   log('executed',ticket)
   return {executed:true,kind:ticket.kind,target:ticket.target,action:ticket.action,result}
  }catch{log('failed',ticket);throw fail('Remote action failed; review authorized service diagnostics.',502)}finally{running=false}
 }
 function revoke(){for(const ticket of tickets.values())log('revoked',ticket);tickets.clear();return {revoked:true}}
 return {authenticate,list,stage,approve,execute,revoke,history:()=>audit.map(x=>({...x}))}
}
