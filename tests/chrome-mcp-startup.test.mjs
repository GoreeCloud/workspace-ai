import test from 'node:test'
import assert from 'node:assert/strict'
import {createChromeLocalClient} from '../server/chrome-mcp-local.mjs'

test('Chrome MCP refuses to launch with no approved hosts',async()=>{
 let started=false
 const client=createChromeLocalClient({
  executable:'/nonexistent/test-mcp',
  allowedHosts:[],
  runner:()=>{started=true;throw Error('unexpected launch')}
 })
 await assert.rejects(client.call('list_pages',{}),/hostname allowlist/)
 assert.equal(started,false)
})

test('Chrome MCP refuses private and malformed hostnames before spawning',async()=>{
 let launches=0
 for(const allowedHosts of [['localhost'],['127.0.0.1'],['example..org'],['https://example.org'],['evil.org/path']]){
  const client=createChromeLocalClient({
   executable:'/nonexistent/test-mcp',allowedHosts,
   runner:()=>{launches++;throw Error('unexpected launch')}
  })
  await assert.rejects(client.call('list_pages',{}),/hostname allowlist/)
 }
 assert.equal(launches,0)
})

test('Chrome MCP passes URL restrictions to the isolated launch process',async()=>{
 const {EventEmitter}=await import('node:events')
 let seen
 function runner(executable,args,opts){
  seen={executable,args,opts}
  const child=new EventEmitter()
  child.stdout=new EventEmitter()
  child.stderr=new EventEmitter()
  child.stdin={write(line,done){
   const message=JSON.parse(line)
   if(message.id){
    let result={}
    if(message.method==='initialize')result={capabilities:{tools:{}}}
    if(message.method==='tools/list')result={tools:[{name:'list_pages'}]}
    if(message.method==='tools/call')result={content:[{type:'text',text:'No pages open'}]}
    queueMicrotask(()=>child.stdout.emit('data',Buffer.from(JSON.stringify({jsonrpc:'2.0',id:message.id,result})+'\\n')))
   }
   done?.()
  }}
  child.kill=()=>queueMicrotask(()=>child.emit('close',0))
  return child
 }
 const client=createChromeLocalClient({executable:'/mock/chrome-devtools-mcp',allowedHosts:['docs.example.org'],runner})
 const output=await client.call('list_pages',{})
 assert.equal(output.content[0].text,'No pages open')
 assert.ok(seen.args.includes('--allowed-url-pattern=https://docs.example.org/*'))
 assert.ok(seen.args.includes('--no-javascript-evaluation'))
 assert.ok(seen.args.includes('--redact-network-headers'))
 assert.ok(seen.args.includes('--category-network=false'))
 assert.equal(seen.opts.shell,false)
 assert.equal(seen.opts.env.CHROME_DEVTOOLS_MCP_NO_CONFIG_DISCOVERY,'1')
 client.close()
})
