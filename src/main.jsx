import React from 'react'
import {createRoot} from 'react-dom/client'
import {selectBrowserAccount,scopeFromStatus,browserAccountScope} from './account-workspace-scope.js'
import './gc-ui-tokens.css'
import './styles.css'
import './connection-field.css'
import './ui-refresh.css'
import './workspace.css'
import {registerWorkspacePwa} from './register-pwa.js'

const root=createRoot(document.getElementById('root'))
async function verifiedScope(){
 const response=await fetch('/api/status?bootstrap=1',{cache:'no-store',signal:AbortSignal.timeout(12000)})
 if(!response.ok)throw Error('Could not verify the current account')
 return scopeFromStatus(await response.json())
}
function Locked({reason}){
 return <main role="alert" style={{maxWidth:630,padding:'3rem 1.5rem',margin:'auto'}}>
  <h1>Workspace locked</h1>
  <p>{reason}</p>
  <p>No other account's conversations or projects were opened or overwritten.</p>
  <button onClick={()=>location.reload()}>Retry verification</button>
 </main>
}
async function bootstrap(){
 try{
  const identity=await verifiedScope()
  selectBrowserAccount(identity)
  registerWorkspacePwa()
  const {default:App}=await import('./App.jsx')
  function VerifiedApp(){
   const [error,setError]=React.useState('')
   React.useEffect(()=>{
    let mounted=true
    const check=async()=>{
     try{
      const current=await verifiedScope()
      if(mounted&&current!==browserAccountScope())setError('The active account changed. Reload to see the correct workspace.')
     }catch{if(mounted)setError('Account identity can no longer be verified. Reload before continuing.')}
    }
    const timer=setInterval(check,2500)
    window.addEventListener('focus',check)
    return ()=>{mounted=false;clearInterval(timer);window.removeEventListener('focus',check)}
   },[])
   return error?<Locked reason={error}/>:<App/>
  }
  root.render(<React.StrictMode><VerifiedApp/></React.StrictMode>)
 }catch(error){root.render(<Locked reason={String(error.message||error)}/>)}
}
void bootstrap()
