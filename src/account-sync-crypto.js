// End-to-end encryption for account-sync snapshots. Password/key never leaves the browser.
export const SYNC_KDF_ITERATIONS=310000
const encode=new TextEncoder(),decode=new TextDecoder()
const base64url=bytes=>{
 let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.slice(i,i+8192))
 return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')
}
const bytes=text=>{
 if(typeof text!=='string'||!/^[A-Za-z0-9_-]+$/.test(text))throw Error('Invalid encrypted snapshot encoding')
 const binary=atob(text.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-text.length%4)%4))
 return Uint8Array.from(binary,c=>c.charCodeAt(0))
}
async function deriveKey(passphrase,salt){
 if(typeof passphrase!=='string'||passphrase.length<12||passphrase.length>1024)throw Error('Use a unique synchronization passphrase of at least 12 characters')
 const material=await crypto.subtle.importKey('raw',encode.encode(passphrase),'PBKDF2',false,['deriveKey'])
 return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:SYNC_KDF_ITERATIONS,hash:'SHA-256'},material,
  {name:'AES-GCM',length:256},false,['encrypt','decrypt'])
}
export async function encryptAccountSnapshot(snapshot,passphrase){
 const content=JSON.stringify(snapshot)
 if(encode.encode(content).byteLength>12*1024*1024)throw Error('Workspace data exceeds 12 MB sync limit')
 const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12))
 const key=await deriveKey(passphrase,salt)
 const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encode.encode('workspace-ai-encrypted-v1')},key,encode.encode(content))
 return {kind:'workspace-ai-encrypted-v1',salt:base64url(salt),iv:base64url(iv),ciphertext:base64url(new Uint8Array(cipher))}
}
export async function decryptAccountSnapshot(envelope,passphrase){
 if(!envelope||envelope.kind!=='workspace-ai-encrypted-v1')throw Error('Unsupported encrypted snapshot')
 const salt=bytes(envelope.salt),iv=bytes(envelope.iv),ciphertext=bytes(envelope.ciphertext)
 if(salt.length!==16||iv.length!==12||ciphertext.length>16*1024*1024)throw Error('Invalid encrypted snapshot')
 const key=await deriveKey(passphrase,salt)
 let plain
 try{plain=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:encode.encode('workspace-ai-encrypted-v1')},key,ciphertext)}
 catch{throw Error('Incorrect passphrase or damaged encrypted snapshot. Local data was not changed.')}
 const json=decode.decode(plain)
 if(encode.encode(json).length>12*1024*1024)throw Error('Decrypted snapshot is too large')
 try{return JSON.parse(json)}catch{throw Error('Invalid decrypted workspace archive')}
}
