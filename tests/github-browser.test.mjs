import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {readGitHubPage, GitHubReadError} from '../server/github-reader.mjs'
import {attachGitHubReadRoute} from '../server/github-routes.mjs'

const credential='synthetic-private-value-for-tests'
const ok = values => ({ok:true,status:200,json:async()=>values})

test('GitHub repositories are GoreeCloud-owned, read-only and secret-free',async()=>{
 const response=await readGitHubPage(credential,{resource:'repos',page:2},async(url,options)=>{
  const u=new URL(url)
  assert.equal(u.origin,'https://api.github.com')
  assert.equal(u.pathname,'/user/repos')
  assert.equal(u.searchParams.get('affiliation'),'owner')
  assert.equal(u.searchParams.get('per_page'),'50')
  assert.equal(u.searchParams.get('page'),'2')
  assert.equal(options.method,'GET')
  assert.equal(options.redirect,'error')
  assert.equal(options.headers.Authorization,'Bearer '+credential)
  return ok([{name:'workspace-ai',owner:{login:'GoreeCloud'},description:'AI workspace',private:true,stargazers_count:5,token:'SECRET'},{name:'foreign',owner:{login:'Other'}}])
 })
 assert.deepEqual(response.results,[{name:'workspace-ai',description:'AI workspace',isPrivate:true,stars:5,updatedAt:''}])
 assert.ok(!JSON.stringify(response).includes(credential))
 assert.ok(!JSON.stringify(response).includes('SECRET'))
})

test('issues and pull requests are limited to fixed GoreeCloud repository URL',async()=>{
 for(const resource of ['issues','pulls']){
  const output=await readGitHubPage(credential,{resource,repo:'workspace-ai'},async(url,options)=>{
   assert.equal(new URL(url).pathname,'/repos/GoreeCloud/workspace-ai/'+resource)
   assert.equal(new URL(url).searchParams.get('state'),'open')
   assert.equal(options.method,'GET')
   return ok([{number:12,title:'Fix issue',state:'open',body:'SECRET BODY'}])
  })
  assert.equal(output.results[0].number,12)
  assert.ok(!JSON.stringify(output).includes('SECRET BODY'))
 }
 const issues=await readGitHubPage(credential,{resource:'issues',repo:'workspace-ai'},async()=>ok([
  {number:1,title:'PR masquerading as issue',pull_request:{url:'x'}},{number:2,title:'Real issue'}
 ]))
 assert.deepEqual(issues.results.map(x=>x.number),[2])
})

test('invalid resource, repository, credentials and pages are rejected before fetch',async()=>{
 const bad = async (token,options)=>assert.rejects(readGitHubPage(token,options,async()=>{throw Error('Must not fetch')}),error=>error instanceof GitHubReadError&&error.status===400)
 for(const opts of [
  {resource:'deletes',repo:'workspace-ai'}, {resource:'issues',repo:'../../private'},
  {resource:'issues',repo:'Other/repo'}, {resource:'repos',repo:'workspace-ai'},
  {resource:'repos',page:0}, {resource:'repos',page:101}, {resource:'repos',page:'1e2'},
  {resource:'repos',page:'01'}, {resource:'repos',page:1.1}
 ])await bad(credential,opts)
 for(const token of ['spaces not allowed','bad\nvalue','x'.repeat(2049)])await bad(token,{resource:'repos'})
})

test('pagination ends at 100 and response excludes foreign account',async()=>{
 const data=Array.from({length:50},(_,i)=>({name:'repo-'+i,owner:{login:'GoreeCloud'}}))
 const page=await readGitHubPage(credential,{page:100},async()=>ok(data))
 assert.equal(page.results.length,50)
 assert.equal(page.nextPage,null)
 const next=await readGitHubPage(credential,{page:1},async()=>ok(data))
 assert.equal(next.nextPage,2)
 const filtered=await readGitHubPage(credential,{},async()=>ok([{name:'bad',owner:{login:'Wrong'}},...data]))
 assert.ok(filtered.results.every(x=>x.name!=='bad'))
})

test('HTTP errors and network failures return sanitized messages',async()=>{
 for(const [status,expected] of [[401,401],[403,403],[404,404],[429,503],[500,503]]){
  await assert.rejects(readGitHubPage(credential,{},async()=>({ok:false,status})),error=>{
   assert.equal(error.status,expected);assert.ok(!error.message.includes(credential));return true
  })
 }
 await assert.rejects(readGitHubPage(credential,{},async()=>{throw Error('Bearer '+credential)}),error=>{
  assert.equal(error.status,503);assert.ok(!error.message.includes(credential));return true
 })
 await assert.rejects(readGitHubPage(credential,{},async()=>ok({error:'malformed'})),error=>error.status===502)
})

test('read route requires authorization, drops stale results and invalidates 401',async()=>{
 let handler
 const app={get(path,fn){assert.equal(path,'/api/integrations/github/data');handler=fn}}
 let token=null,revision=0,invalidated=false,resolvePending
 let reader=()=>new Promise(resolve=>{resolvePending=resolve})
 const config={origins:new Set(['http://127.0.0.1:3031']),getToken:()=>token,getRevision:()=>revision,invalidate:()=>{token=null;revision++;invalidated=true}}
 attachGitHubReadRoute(app,config,(...args)=>reader(...args))
 const call=async(headers={origin:'http://127.0.0.1:3031'},query={})=>{
  const response={code:200,body:null,status(n){this.code=n;return this},json(data){this.body=data;return this}}
  await handler({headers,query},response)
  return response
 }
 assert.equal((await call()).code,409)
 token=credential
 assert.equal((await call({origin:'https://attacker.invalid'})).code,403)
 assert.equal((await call({'sec-fetch-site':'cross-site'})).code,403)
 const promise=call()
 await new Promise(resolve=>setImmediate(resolve))
 revision++
 resolvePending({resource:'repos',repo:null,results:[{name:'stale'}],nextPage:null})
 assert.equal((await promise).code,409)
 reader=()=>{throw new GitHubReadError(401,'Rejected')}
 const rejected=await call()
 assert.equal(rejected.code,401)
 assert.equal(invalidated,true)
 assert.equal(token,null)
 assert.ok(!JSON.stringify(rejected.body).includes(credential))
})

test('frontend offers local search and does not store credentials',async()=>{
 const text=await readFile(new URL('../src/GitHubBrowser.jsx',import.meta.url),'utf8')
 assert.match(text,/Search loaded repositories/)
 assert.match(text,/visibleRepos\.map/)
 assert.match(text,/aria-label="Read-only GoreeCloud GitHub browser"/)
 assert.doesNotMatch(text,/localStorage|sessionStorage|Authorization|PUT|DELETE/)
})

test('integration route is wired to the shared session, not client tokens',async()=>{
 const text=await readFile(new URL('../server/integration-routes.mjs',import.meta.url),'utf8')
 assert.match(text,/attachGitHubReadRoute\(app/)
 assert.match(text,/getToken:\(\)=>tokens\.get\('github'\)/)
 assert.match(text,/getRevision:\(\)=>revisions\.get\('github'\)/)
})
