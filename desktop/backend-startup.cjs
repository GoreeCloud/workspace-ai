'use strict'

/**
 * Only trust the backend process spawned by this desktop host.
 * A successful response from an unknown service on a guessed local port
 * does not establish backend identity.
 */
function waitForBackendStart(child,port,{timeoutMs=15000}={}){
 if(!child||!child.stdout||!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid desktop backend process')
 return new Promise((resolve,reject)=>{
  let buffer='',done=false
  const expected='Workspace AI backend: http://127.0.0.1:'+port
  const timer=setTimeout(()=>finish(Error('Workspace AI backend startup timed out')),timeoutMs)
  function cleanup(){
   clearTimeout(timer)
   child.stdout.off('data',receive)
   child.off('error',failed)
   child.off('exit',exited)
  }
  function finish(error){
   if(done)return
   done=true;cleanup()
   if(error)reject(error);else resolve()
  }
  function receive(chunk){
   buffer+=String(chunk)
   if(buffer.length>4096)return finish(Error('Unexpected desktop backend startup output'))
   let end
   while((end=buffer.indexOf('\n'))>=0){
    const line=buffer.slice(0,end).trim()
    buffer=buffer.slice(end+1)
    if(line===expected)return finish()
   }
  }
  function failed(error){finish(error||Error('Workspace AI backend spawn failed'))}
  function exited(code,signal){finish(Error('Workspace AI backend exited before becoming ready ('+(signal||code)+')'))}
  child.stdout.on('data',receive)
  child.on('error',failed)
  child.on('exit',exited)
  if(child.exitCode!==null||child.signalCode!==null)exited(child.exitCode,child.signalCode)
 })
}
module.exports={waitForBackendStart}
