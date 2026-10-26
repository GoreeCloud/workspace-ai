// Read-only route-source inspection for the private development acceptance probe.
// UDP connect selects a local route and ephemeral source address but sends no
// datagram and creates no remote application session.
import {createSocket} from 'node:dgram'
import {isIP} from 'node:net'

export function isNetBirdIPv4(address) {
  if (isIP(address) !== 4) return false
  const [first, second] = address.split('.').map(Number)
  return first === 100 && second >= 64 && second <= 127
}

export function routeSourceIPv4(destination) {
  if (isIP(destination) !== 4) {
    return Promise.reject(new Error('Route probe requires an IPv4 destination'))
  }
  return new Promise((resolve,reject)=>{
    const socket=createSocket('udp4')
    let settled=false
    const finish=(error,source)=>{
      if(settled)return
      settled=true
      socket.removeListener('error',onError)
      try{socket.close()}catch{}
      if(error)reject(error)
      else resolve(source)
    }
    const onError=error=>finish(error)
    socket.once('error',onError)
    try{
      socket.connect(443,destination,()=>{
        try{
          const source=socket.address().address
          if(isIP(source)!==4)throw Error('Route probe returned no IPv4 source')
          finish(null,source)
        }catch(error){finish(error)}
      })
    }catch(error){finish(error)}
  })
}
