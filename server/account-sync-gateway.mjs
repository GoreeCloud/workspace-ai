// Deploy only behind an approved HTTPS reverse proxy and restrictive network controls.
// JWT audience allowlist and verified issuer bind every request to an OpenAI account.
import {createRemoteJWKSet,jwtVerify} from 'jose'
import express from 'express'
import {createAccountSyncStore} from './account-sync-store.mjs'
export function createAccountSyncGateway({audiences=(process.env.WORKSPACE_SYNC_OAUTH_CLIENT_IDS||'').split(',').map(x=>x.trim()).filter(Boolean),store=createAccountSyncStore(),verifyToken}={}){
 const app=express()
 app.disable('x-powered-by')
 app.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');next()})
 app.use(express.json({limit:'16mb'}))
 const jwks=createRemoteJWKSet(new URL('https://auth.openai.com/.well-known/jwks.json'))
 const verifier=verifyToken|| (async token=>{
  const {payload}=await jwtVerify(token,jwks,{issuer:'https://auth.openai.com',audience:audiences})
  return payload.sub
 })
 const authorized=async(req,res,next)=>{
  if(!audiences.length)return res.status(503).json({error:'Approved OAuth client audiences are not configured'})
  const token=req.headers.authorization?.match(/^Bearer (\S{100,8192})$/)?.[1]
  if(!token)return res.status(401).json({error:'Account identity token required'})
  try{
   const subject=await verifier(token)
   if(typeof subject!=='string'||!subject||subject.length>512)throw Error('Invalid account identity')
   req.accountSubject=subject;next()
  }catch{return res.status(401).json({error:'Account identity not verified'})}
 }
 app.get('/v1/snapshot',authorized,async(req,res)=>{
  try{res.json(await store.get(req.accountSubject))}
  catch{return res.status(500).json({error:'Encrypted snapshot unavailable'})}
 })
 app.put('/v1/snapshot',authorized,async(req,res)=>{
  try{
   const result=await store.put(req.accountSubject,req.body?.envelope,req.body?.expectedRevision)
   return res.status(result.conflict?409:200).json(result)
  }catch(e){return res.status(400).json({error:String(e.message).slice(0,150)})}
 })
 app.use((_req,res)=>res.status(404).json({error:'Unknown endpoint'}))
 return app
}
