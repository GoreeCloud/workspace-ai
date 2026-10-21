// Reviewed, opt-in MCP HTTP client and exact argument validators.
import {request as httpsRequest} from 'node:https'
import {lookup as dnsLookup} from 'node:dns/promises'
import {isIP} from 'node:net'

const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)
const only=(obj,keys)=>Object.keys(obj).every(key=>keys.includes(key))
export function publicIPv4(ip){
 if(isIP(ip)!==4)return false
 const [a,b,c]=ip.split('.').map(Number)
 if(a===0||a===10||a===127||a>=224)return false
 if(a===100&&b>=64&&b<=127)return false
 if(a===169&&b===254)return false
 if(a===172&&b>=16&&b<=31)return false
 if(a===192&&(b===0||b===2||b===88&&c===99||b===168))return false
 if(a===198&&(b===18||b===19||b===51&&c===100))return false
 if(a===203&&b===0&&c===113)return false
 return true
}
export function validateMcpEndpoint(raw){
 if(typeof raw!=='string'||raw.length>2048)throw Error('MCP endpoint is not configured.')
 let url
 try{url=new URL(raw)}catch{throw Error('MCP endpoint is invalid.')}
 if(url.protocol!=='https:'||url.username||url.password||url.hash||url.port||url.hostname==='localhost'||isIP(url.hostname.replace(/^\[|\]$/g,'')))
  throw Error('MCP endpoint requires an approved public HTTPS hostname on the default port.')
 return url
}
const pageUrl=input=>{
 if(typeof input!=='string'||input.length>2000)throw Error('A public HTTPS page URL is required.')
 let url
 try{url=new URL(input)}catch{throw Error('Invalid public URL.')}
 if(url.protocol!=='https:'||url.username||url.password||url.hash||url.port||url.hostname==='localhost'||isIP(url.hostname.replace(/^\[|\]$/g,'')))
  throw Error('Only public HTTPS page URLs are supported.')
 return url
}
export function validateApprovedMcpArguments(provider,name,args,{allowCommands=[],allowHosts=[]}={}){
 if(!record(args))throw Error('Tool arguments must be a JSON object.')
 if(provider==='remote-desktop-commander'&&name==='devices.list'){
  if(Object.keys(args).length)throw Error('Device-list reads accept no arguments.')
  return {}
 }
 if(provider==='remote-desktop-commander'&&name==='process.execute'){
  if(!only(args,['command'])||typeof args.command!=='string'||args.command.length>400||/[\r\n\0]/.test(args.command))
   throw Error('Invalid exact approved command.')
  if(!allowCommands.includes(args.command))throw Error('Command not on the administrator exact-match allowlist.')
  return {command:args.command}
 }
 if(provider==='firecrawl'&&['web.scrape','web.crawl'].includes(name)){
  if(!only(args,name==='web.crawl'?['url','limit']:['url']))throw Error('Unsupported content parameters.')
  const url=pageUrl(args.url)
  if(!allowHosts.includes(url.hostname))throw Error('Content hostname is not on the exact-match allowlist.')
  if(name==='web.scrape')return {url:url.href}
  if(!Number.isInteger(args.limit)||args.limit<1||args.limit>5)throw Error('Crawl limit must be 1–5.')
  return {url:url.href,limit:args.limit}
 }
 throw Error('No reviewed execution adapter for this tool.')
}
const jsonRpc=(text,id)=>{
 const bodies=[]
 if(text.startsWith('{'))bodies.push(text)
 else for(const part of text.split(/\r?\n\r?\n/)){
  const data=part.split(/\r?\n/).filter(x=>x.startsWith('data:')).map(x=>x.slice(5).trim()).join('\n')
  if(data)bodies.push(data)
 }
 for(const body of bodies){
  try{
   const item=JSON.parse(body)
   if(item?.jsonrpc==='2.0'&&item.id===id&&(record(item.result)||record(item.error)))return item
  }catch{}
 }
 throw Error('MCP server returned an invalid tool response.')
}
export async function secureMcpPost(url,payload,{token='',session='',lookup=dnsLookup,timeoutMs=12000,maxBytes=262144}={}){
 const target=validateMcpEndpoint(String(url))
 const answers=await lookup(target.hostname,{all:true,verbatim:true})
 const v4=answers.filter(x=>x.family===4)
 if(!v4.length||answers.some(x=>x.family!==4&&x.family!==6)||v4.some(x=>!publicIPv4(x.address)))throw Error('MCP endpoint resolves to disallowed network addresses.')
 const address=v4[0].address
 const body=JSON.stringify(payload)
 return new Promise((resolve,reject)=>{
  let finished=false
  const settle=(err,result)=>{if(finished)return;finished=true;err?reject(err):resolve(result)}
  const request=httpsRequest(target,{
   method:'POST',timeout:timeoutMs,servername:target.hostname,rejectUnauthorized:true,
   lookup:(_host,_options,cb)=>cb(null,address,4),
   headers:{'Content-Type':'application/json','Accept':'application/json, text/event-stream','Accept-Encoding':'identity',
    'MCP-Protocol-Version':'2025-06-18',...(token?{Authorization:'Bearer '+token}:{}),
    ...(session?{'Mcp-Session-Id':session}:{}),'Content-Length':Buffer.byteLength(body)}
  },response=>{
   if(response.statusCode<200||response.statusCode>=300){request.destroy();settle(Error('MCP returned HTTP '+response.statusCode));return}
   const pieces=[];let total=0
   response.on('data',part=>{
    total+=part.length
    if(total>maxBytes){request.destroy();settle(Error('MCP response exceeds allowed size.'));return}
    pieces.push(part)
   })
   response.on('end',()=>settle(null,{text:Buffer.concat(pieces).toString('utf8'),session:response.headers['mcp-session-id']||null}))
   response.on('aborted',()=>settle(Error('MCP response interrupted.')))
   response.on('error',err=>settle(err))
  })
  request.on('timeout',()=>{request.destroy();settle(Error('MCP request timeout.'))})
  request.on('error',err=>settle(err))
  request.end(body)
 })
}
export async function invokeReviewedMcp({provider,toolName,args,endpoint,token,allowCommands=[],allowHosts=[],rpc=secureMcpPost,preCall=()=>{}}){
 const validated=validateApprovedMcpArguments(provider,toolName,args,{allowCommands,allowHosts})
 const target=validateMcpEndpoint(endpoint)
 let session=''
 const send=async(message)=>{
  const response=await rpc(target,message,{token,session})
  if(!response||typeof response.text!=='string')throw Error('Malformed MCP transport response.')
  if(response.session){
   if(typeof response.session!=='string'||! /^[\x21-\x7e]{1,128}$/.test(response.session))throw Error('Invalid MCP session.')
   session=response.session
  }
  if(message.method==='notifications/initialized')return null
  const item=jsonRpc(response.text,message.id)
  if(item.error)throw Error('MCP protocol error.')
  return item.result
 }
 const init=await send({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'GoreeCloud Workspace AI',version:'0.3.0'}}})
 if(!init?.capabilities?.tools)throw Error('MCP tool support was not advertised.')
 await send({jsonrpc:'2.0',method:'notifications/initialized'})
 const catalog=await send({jsonrpc:'2.0',id:2,method:'tools/list',params:{}})
 if(!Array.isArray(catalog?.tools)||!catalog.tools.some(t=>t?.name===toolName))throw Error('Approved tool is no longer in the MCP catalog.')
 await preCall()
 const result=await send({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:toolName,arguments:validated}})
 if(result?.isError===true)throw Error('MCP tool reported a provider error.')
 const encoded=JSON.stringify(result)
 if(typeof encoded!=='string'||Buffer.byteLength(encoded)>32768)throw Error('MCP result exceeds limit.')
 return JSON.parse(encoded)
}
