let installPrompt=null
if(typeof window!=='undefined')window.addEventListener('beforeinstallprompt',event=>{
 event.preventDefault()
 installPrompt=event
 window.dispatchEvent(new Event('goreecloud:pwa-install-available'))
})
export function availableInstallPrompt(){return installPrompt}
export async function requestWorkspaceInstallation(){
 const prompt=installPrompt
 if(!prompt)return false
 installPrompt=null
 await prompt.prompt()
 await prompt.userChoice
 return true
}
export function registerWorkspacePwa(){
 if(typeof window==='undefined'||!('serviceWorker' in navigator)||location.protocol==='file:')return
 const register=()=>navigator.serviceWorker.register('/sw.js').catch(()=>{})
 if(document.readyState==='complete')void register()
 else window.addEventListener('load',register,{once:true})
}