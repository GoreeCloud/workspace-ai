import test from 'node:test'
import assert from 'node:assert/strict'

test('PWA install helper distinguishes accepted, dismissed, unavailable and failed browser prompts',async()=>{
 const previousWindow=globalThis.window
 const listeners=new Map()
 globalThis.window={
  addEventListener:(name,handler)=>listeners.set(name,handler),
  dispatchEvent:()=>true
 }
 try{
  const {availableInstallPrompt,requestWorkspaceInstallation}=await import('../src/register-pwa.js?install-outcome-test')
  assert.equal(await requestWorkspaceInstallation(),false)
  const offer=(choice,fail=false)=>{
   let prevented=false
   const offered={
    preventDefault(){prevented=true},
    async prompt(){if(fail)throw Error('browser denied prompt')},
    userChoice:Promise.resolve({outcome:choice})
   }
   listeners.get('beforeinstallprompt')(offered)
   assert.equal(prevented,true)
   return offered
  }
  const accepted=offer('accepted')
  assert.equal(availableInstallPrompt(),accepted)
  assert.equal(await requestWorkspaceInstallation(),true)
  assert.equal(availableInstallPrompt(),null)
  offer('dismissed')
  assert.equal(await requestWorkspaceInstallation(),false)
  assert.equal(await requestWorkspaceInstallation(),false)
  offer('accepted',true)
  await assert.rejects(()=>requestWorkspaceInstallation(),/browser denied prompt/)
  assert.equal(availableInstallPrompt(),null)
 }finally{
  if(previousWindow===undefined)delete globalThis.window
  else globalThis.window=previousWindow
 }
})
