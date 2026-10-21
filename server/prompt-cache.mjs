// Provider-side prefix affinity, scoped to an account and active API credential.
// A random process key avoids exporting personal prompt text, tokens or raw identities.
import {createHmac,randomBytes} from 'node:crypto'
const salt=randomBytes(32)
export function promptCacheKey({accountId=null,credential,model,messages}={}){
  if(typeof credential!=='string'||!credential||
     typeof model!=='string'||!model||
     !Array.isArray(messages)||!messages.length||typeof messages[0]?.content!=='string')return null
  const prefix=messages[0].content
  if(!prefix)return null
  const hash=createHmac('sha256',salt)
  for(const item of [accountId||'guest',credential,model,prefix]){
    hash.update(String(item.length)).update(':').update(item).update('|')
  }
  return 'gcwa_'+hash.digest('hex').slice(0,48)
}
