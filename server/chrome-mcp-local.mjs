// Opt-in Chrome DevTools MCP via an isolated local stdio process.
// This is not the user's signed-in personal Chrome profile.
import {spawn} from 'node:child_process'
import {existsSync} from 'node:fs'
import {resolve,isAbsolute} from 'node:path'
import {fileURLToPath} from 'node:url'

const ROOT=fileURLToPath(new URL('../',import.meta.url))
export const REVIEWED_CHROME_TOOLS=Object.freeze([
 {name:'list_pages',label:'List isolated browser tabs',mode:'read',risk:'medium'},
 {name:'take_snapshot',label:'Inspect browser page',mode:'read',risk:'medium'},
 {name:'new_page',label:'Open approved HTTPS website',mode:'write',risk:'high'},
 {name:'click',label:'Click page element',mode:'write',risk:'critical'},
 {name:'fill',label:'Fill page form',mode:'write',risk:'critical'}
])
export function chromeExecutablePath(input=process.env.WORKSPACE_CHROME_MCP_EXECUTABLE){
 // Admin-controlled path only: never accept a path from the browser or an AI model.
 const candidate=input||resolve(ROOT,'node_modules/.bin/chrome-devtools-mcp')
 return isAbsolute(candidate)&&existsSync(candidate)?candidate:null
}
export function createChromeLocalClient({executable=chromeExecutablePath(),allowedHosts=[],runner=spawn}={}){
 let child=null,sequence=0,buffer='',broken=null,initialized=false
 const pending=new Map()
 const failAll=error=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(error)}pending.clear()}
 function onLine(text){
  if(!text.trim())return
  let message
  try{message=JSON.parse(text)}catch{broken=Error('Malformed Chrome MCP response.');failAll(broken);child?.kill();return}
  if(typeof message.id!=='number')return
  const item=pending.get(message.id)
  if(!item)return
  pending.delete(message.id);clearTimeout(item.timer)
  if(message.error)item.reject(Error('Chrome MCP rejected an operation.'))
  else item.resolve(message.result)
 }
 function start(){
  if(!executable)throw Error('Chrome DevTools MCP is not installed or configured.')
  if(!Array.isArray(allowedHosts)||allowedHosts.length===0||allowedHosts.length>24||allowedHosts.some(host=>typeof host!=='string'||!(/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/).test(host)||host.includes('..')||host==='localhost'||/^\d+\.\d+\.\d+\.\d+$/.test(host)))throw Error('Chrome MCP requires an exact approved hostname allowlist.')
  const patterns=[...new Set(allowedHosts)].map(host=>'--allowed-url-pattern=https://'+host+'/*')
  const env={
   PATH:process.env.PATH||'/usr/bin:/bin',
   HOME:process.env.HOME||'/tmp',
   TMPDIR:process.env.TMPDIR||'/tmp',
   CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS:'1',
   CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS:'1',
   CHROME_DEVTOOLS_MCP_NO_CONFIG_DISCOVERY:'1'
  }
  // Disable telemetry, JavaScript evaluation and file navigation where supported.
  child=runner(executable,['--isolated','--headless','--no-usage-statistics','--no-performance-crux','--no-file-navigations','--no-javascript-evaluation','--redact-network-headers','--no-source-maps','--category-network=false','--category-memory=false','--category-debugging=false','--category-performance=false','--category-emulation=false',...patterns],{
   cwd:ROOT,env,stdio:['pipe','pipe','pipe'],shell:false
  })
  child.stdout.on('data',chunk=>{
   buffer+=chunk.toString('utf8')
   if(Buffer.byteLength(buffer)>262144){broken=Error('Chrome MCP response too large.');failAll(broken);child?.kill();return}
   let end
   while((end=buffer.indexOf('\n'))>=0){const text=buffer.slice(0,end);buffer=buffer.slice(end+1);onLine(text)}
  })
  child.stderr?.on('data',()=>{}) // Drain stderr. Never forward browser content or secrets to logs.
  child.on('error',()=>{broken=Error('Chrome MCP process failed.');failAll(broken);child=null;initialized=false})
  child.on('close',()=>{broken=Error('Chrome MCP process stopped.');failAll(broken);child=null;initialized=false})
 }
 function send(method,params={},timeoutMs=12000){
  if(broken)throw broken
  if(!child)start()
  const message={jsonrpc:'2.0',id:++sequence,method,params}
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{pending.delete(message.id);reject(Error('Chrome MCP timed out.'));child?.kill()},timeoutMs)
   pending.set(message.id,{resolve,reject,timer})
   child.stdin.write(JSON.stringify(message)+'\n',error=>{
    if(error){clearTimeout(timer);pending.delete(message.id);reject(Error('Chrome MCP input unavailable.'))}
   })
  })
 }
 async function initialize(){
  if(initialized)return
  const result=await send('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'Workspace AI',version:'0.1.0'}})
  if(!result?.capabilities?.tools)throw Error('Chrome MCP tool support unavailable.')
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n')
  initialized=true
 }
 async function call(name,args){
  await initialize()
  const catalog=await send('tools/list')
  if(!Array.isArray(catalog?.tools)||!catalog.tools.some(t=>t?.name===name))throw Error('Chrome MCP tool is not available.')
  if(!REVIEWED_CHROME_TOOLS.some(t=>t.name===name))throw Error('Chrome MCP tool not reviewed.')
  const result=await send('tools/call',{name,arguments:args},30000)
  if(result?.isError)throw Error('Chrome MCP operation failed.')
  const encoded=JSON.stringify(result)
  if(!encoded||Buffer.byteLength(encoded)>32768)throw Error('Chrome MCP output exceeded limit.')
  return JSON.parse(encoded)
 }
 function close(){child?.kill();child=null;initialized=false;failAll(Error('Chrome MCP connection closed.'))}
 return {initialize,call,close}
}
