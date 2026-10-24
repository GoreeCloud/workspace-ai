#!/usr/bin/env node
// Read-only public-path denial acceptance from an owner-controlled client.
// Supply the independently verified IPv4 address of the actual VPS public NIC.
// Never send owner credentials or the real Caddy-to-backend peer token.
import {isIP} from 'node:net'
import {request} from 'node:https'
import {pathToFileURL} from 'node:url'

const hostname='workspace-ai-dev.goreecloud.com'
const path='/api/status'

export function isPublicIPv4(address){
  if(typeof address!=='string' || isIP(address)!==4) return false
  const [a,b,c]=address.split('.').map(Number)
  return !(
    a===0 || a===10 || a===127 || a>=224 ||
    (a===100 && b>=64 && b<=127) ||
    (a===169 && b===254) ||
    (a===172 && b>=16 && b<=31) ||
    (a===192 && (b===168 || (b===0 && c===0) || (b===0 && c===2))) ||
    (a===198 && ((b===18 || b===19) || (b===51 && c===100))) ||
    (a===203 && b===0 && c===113)
  )
}

export function isNetBirdOverlayIPv4(address){
  if(typeof address!=='string' || isIP(address)!==4) return false
  const [a,b]=address.split('.').map(Number)
  return a===100 && b>=64 && b<=127
}

// Newer Node HTTPS clients request an array of address records (`all:true`).
// Preserve the same forced address under either lookup callback signature.
export function forcedIPv4Lookup(publicIPv4){
  if(!isPublicIPv4(publicIPv4)) throw new Error('A verified public VPS IPv4 address is required')
  return (_hostname,options,callback)=>{
    if(options?.all) callback(null,[{address:publicIPv4,family:4}])
    else callback(null,publicIPv4,4)
  }
}

export function probePublicDeny(publicIPv4,headers={}){
  if(!isPublicIPv4(publicIPv4)) throw new Error('A verified public VPS IPv4 address is required')
  return new Promise((resolve,reject)=>{
    const req=request({
      hostname,servername:hostname,port:443,method:'GET',path,
      timeout:8000,rejectUnauthorized:true,
      lookup:forcedIPv4Lookup(publicIPv4),
      headers:{Accept:'application/json',...headers}
    },res=>{
      const code=res.statusCode
      const server=res.headers.server
      const localAddress=res.socket?.localAddress
      const remoteAddress=res.socket?.remoteAddress
      res.resume()
      res.once('end',()=>resolve({code,server,localAddress,remoteAddress}))
    })
    req.once('timeout',()=>req.destroy(new Error('Public HTTPS probe timed out')))
    req.once('error',reject)
    req.end()
  })
}

export async function main(publicIPv4){
  if(!isPublicIPv4(publicIPv4)){
    throw new Error('Usage: node scripts/private-dev-public-deny.mjs VERIFIED_PUBLIC_VPS_IPV4')
  }
  const attempts=[
    ['normal public request',{}],
    ['spoofed overlay/peer headers',{
      'X-Forwarded-For':'100.71.0.25',
      'X-Real-IP':'100.71.0.25',
      Forwarded:'for=100.71.0.25',
      'X-GoreeCloud-Gateway-Version':'1',
      'X-GoreeCloud-Gateway-Token':'deliberately-invalid-qa-token'
    }]
  ]
  for(const [label,headers] of attempts){
    const {code,server,localAddress,remoteAddress}=await probePublicDeny(publicIPv4,headers)
    if(remoteAddress!==publicIPv4 || typeof localAddress!=='string' || isIP(localAddress)!==4 || isNetBirdOverlayIPv4(localAddress) || localAddress.startsWith('127.')){
      throw new Error(`${label}: not proven to use a direct, non-NetBird IPv4 path to the requested public VPS address`)
    }
    if(code!==403 || String(server).toLowerCase()!=='caddy'){
      throw new Error(`${label}: expected HTTPS 403 from Caddy; received HTTP ${code} via ${server||'unknown server'}`)
    }
    console.log(`PASS ${label}: HTTPS 403 from Caddy (verified TLS)`)
  }
  console.log('PASS private development denied over independently verified public VPS address')
  console.log('NOTE: this does not validate NetBird ACLs, VPN disconnect, owner browser login or recovery')
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  main(process.argv[2]).catch(error=>{
    console.error('FAIL public ingress denial: '+(error?.message||String(error)))
    process.exitCode=1
  })
}
