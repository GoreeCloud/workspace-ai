import test from 'node:test'
import assert from 'node:assert/strict'
import {EventEmitter} from 'node:events'
import {PassThrough} from 'node:stream'
import {createRequire} from 'node:module'
import {readFileSync} from 'node:fs'
const require=createRequire(import.meta.url)
const {waitForBackendStart}=require('../desktop/backend-startup.cjs')
function fakeProcess(){
 const child=new EventEmitter()
 child.stdout=new PassThrough()
 child.exitCode=null;child.signalCode=null
 return child
}
test('desktop host confirms exact successful spawn and port, even across split output',async()=>{
 const child=fakeProcess()
 const promise=waitForBackendStart(child,3131,{timeoutMs:250})
 child.stdout.write('Workspace AI backend: http://127.0.')
 child.stdout.write('0.1:3131\n')
 await promise
})
test('unrelated or spoofed local service status cannot replace child handshake',async()=>{
 const child=fakeProcess()
 const promise=waitForBackendStart(child,3131,{timeoutMs:20})
 child.stdout.write('Workspace AI backend: http://127.0.0.1:3132\n')
 await assert.rejects(promise,/timed out/)
})
test('failed or terminated desktop backend interrupts startup',async()=>{
 const child=fakeProcess()
 const promise=waitForBackendStart(child,3131,{timeoutMs:250})
 child.emit('exit',1,null)
 await assert.rejects(promise,/exited before becoming ready/)
})
test('unexpected startup output is bounded',async()=>{
 const child=fakeProcess()
 const promise=waitForBackendStart(child,3131,{timeoutMs:250})
 child.stdout.write('x'.repeat(4100))
 await assert.rejects(promise,/Unexpected desktop backend startup/)
})
test('desktop host requires user confirmation for media and packages startup helper',()=>{
 const main=readFileSync(new URL('../desktop/main.cjs',import.meta.url),'utf8')
 const pkg=JSON.parse(readFileSync(new URL('../desktop/package.json',import.meta.url),'utf8'))
 assert.match(main,/waitForBackendStart\(backend,port\)/)
 assert.match(main,/setPermissionRequestHandler/)
 assert.match(main,/dialog\.showMessageBox/)
 assert.match(main,/defaultId:0,cancelId:0/)
 assert.ok(pkg.build.files.includes('backend-startup.cjs'))
})
