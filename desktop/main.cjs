'use strict'
// Experimental desktop wrapper: not a signed or released application.
const {app,BrowserWindow,shell,session,dialog}=require('electron')
const {spawn}=require('node:child_process')
const {createServer}=require('node:net')
const path=require('node:path')
const {allowedLocalNavigation,externalAuthenticationLink}=require('./navigation.cjs')
const {waitForBackendStart}=require('./backend-startup.cjs')
let backend,window,port,shuttingDown=false
const root=app.isPackaged?path.join(process.resourcesPath,'workspace'):path.resolve(__dirname,'..')
function ephemeralPort(){
 return new Promise((resolve,reject)=>{const socket=createServer()
  socket.on('error',reject)
  socket.listen(0,'127.0.0.1',()=>{const p=socket.address().port;socket.close(()=>resolve(p))})})
}
async function ready(port,process){
 const url='http://127.0.0.1:'+port+'/api/status'
 for(let i=0;i<70;i++){
  if(process.exitCode!==null||process.signalCode!==null)throw Error('Backend stopped during startup')
  try{const r=await fetch(url,{signal:AbortSignal.timeout(700),cache:'no-store'});if(r.ok)return}catch{}
  await new Promise(resolve=>setTimeout(resolve,150))
 }
 throw Error('The Workspace AI backend did not start')
}
function stop(){if(shuttingDown)return;shuttingDown=true;backend?.kill('SIGTERM')}
async function launch(){
 port=await ephemeralPort()
 backend=spawn(process.execPath,[path.join(root,'server','index.mjs')],{
  cwd:root,windowsHide:true,stdio:['ignore','pipe','ignore'],
  env:{...process.env,ELECTRON_RUN_AS_NODE:'1',WORKSPACE_AI_PORT:String(port)}
 })
 await waitForBackendStart(backend,port)
 await ready(port,backend)
 const origin='http://127.0.0.1:'+port
 window=new BrowserWindow({width:1280,height:830,minWidth:660,minHeight:510,title:'GoreeCloud Workspace AI',
  autoHideMenuBar:true,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,spellcheck:true}})
 session.defaultSession.setPermissionRequestHandler((contents,permission,callback)=>{
  if(!allowedLocalNavigation(contents.getURL(),port)||permission!=='media'||!window||window.isDestroyed())return callback(false)
  dialog.showMessageBox(window,{type:'question',buttons:['Deny','Allow'],defaultId:0,cancelId:0,noLink:true,
   title:'Workspace AI device permission',message:'Allow Workspace AI to access your camera or microphone?',
   detail:'Only continue if you just selected a camera, photo or microphone action.'
  }).then(({response})=>callback(response===1&&allowedLocalNavigation(contents.getURL(),port)))
   .catch(()=>callback(false))
 })
 window.webContents.setWindowOpenHandler(({url})=>{
  const auth=externalAuthenticationLink(url)
  if(auth)void shell.openExternal(auth)
  return {action:'deny'}
 })
 window.webContents.on('will-navigate',(event,target)=>{
  if(allowedLocalNavigation(target,port))return
  event.preventDefault()
  const auth=externalAuthenticationLink(target)
  if(auth)void shell.openExternal(auth)
 })
 await window.loadURL(origin)
 window.on('closed',()=>{window=null})
 backend.once('exit',()=>{if(!shuttingDown){shuttingDown=true;window?.close();app.quit()}})
}
app.whenReady().then(launch).catch(err=>{console.error('Workspace AI desktop startup:',err.message);stop();app.quit()})
app.on('before-quit',stop)
app.on('window-all-closed',()=>{stop();app.quit()})
process.on('SIGINT',()=>{stop();app.quit()})
process.on('SIGTERM',()=>{stop();app.quit()})
