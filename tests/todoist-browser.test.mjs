import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { readTodoistPage, TodoistReadError } from '../server/todoist-reader.mjs'
import { TOKEN_PROVIDERS } from '../server/service-validation.mjs'
import { attachIntegrationRoutes } from '../server/integration-routes.mjs'

test('Todoist uses current API v1 rather than deprecated REST v2', () => {
  assert.equal(TOKEN_PROVIDERS.todoist.url, 'https://api.todoist.com/api/v1/projects?limit=1')
})

test('Todoist read adapter limits responses, strips extraneous data and makes only GET requests', async () => {
  const key = 'private-synthetic-only'
  const project = await readTodoistPage(key, {resource:'projects'}, async (url, options) => {
    assert.equal(url, 'https://api.todoist.com/api/v1/projects?limit=50')
    assert.equal(options.method, 'GET')
    assert.equal(options.redirect, 'error')
    assert.equal(options.headers.Authorization, 'Bearer ' + key)
    return {ok:true,json:async()=>({results:[{id:'proj1',name:'GoreeCloud',is_favorite:true,email:'hidden'}],next_cursor:'page2'})}
  })
  assert.deepEqual(project, {resource:'projects',results:[{id:'proj1',name:'GoreeCloud',isFavorite:true}],nextCursor:'page2',readOnly:true})
  assert.ok(!JSON.stringify(project).includes(key))
  const tasks = await readTodoistPage(key, {resource:'tasks',projectId:'proj1',cursor:'page2'}, async (url, options) => {
    const u=new URL(url)
    assert.equal(u.origin,'https://api.todoist.com')
    assert.equal(u.pathname,'/api/v1/tasks')
    assert.equal(u.searchParams.get('project_id'),'proj1')
    assert.equal(u.searchParams.get('cursor'),'page2')
    assert.equal(options.method,'GET')
    return {ok:true,json:async()=>({results:[{id:'task1',project_id:'proj1',content:'Read docs',priority:2,due:{date:'2026-10-20'},api_key:'hidden'}],next_cursor:null})}
  })
  assert.deepEqual(tasks.results,[{id:'task1',projectId:'proj1',content:'Read docs',priority:2,dueDate:'2026-10-20'}])
  assert.ok(!JSON.stringify(tasks).includes('hidden'))
})

test('Todoist rejects malformed client pagination and handles provider failures without leaking credentials', async () => {
  await assert.rejects(readTodoistPage('key',{resource:'anything'}),e=>e instanceof TodoistReadError&&e.status===400)
  await assert.rejects(readTodoistPage('key',{resource:'tasks',projectId:'../../etc/passwd'}),e=>e.status===400)
  await assert.rejects(readTodoistPage('key',{cursor:'invalid\ncontrol'}),e=>e.status===400)
  await assert.rejects(readTodoistPage('key',{resource:'projects'},async()=>({ok:false,status:401})),e=>e.status===401)
  await assert.rejects(readTodoistPage('key',{resource:'projects'},async()=>({ok:false,status:429})),e=>e.status===503)
  await assert.rejects(readTodoistPage('key',{resource:'projects'},async()=>({ok:true,json:async()=>[] })),e=>e.status===502)
})

test('Todoist local data endpoint gates reads and rejects stale or revoked sessions', async () => {
  const app=express();app.use(express.json())
  let resolvePending
  let dataFn=async()=>({resource:'projects',results:[{id:'p',name:'Demo'}],nextCursor:null})
  const reader=(...args)=>dataFn(...args)
  attachIntegrationRoutes(app,new Set(['http://127.0.0.1:3031']),{
    checkToken:async()=>({status:'connected',message:'Synthetic accepted'}),
    readTodoist:reader
  })
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))})
  const url='http://127.0.0.1:'+server.address().port+'/api/integrations'
  const headers={Origin:'http://127.0.0.1:3031','Content-Type':'application/json'}
  const post=(route,body={})=>fetch(url+route,{method:'POST',headers,body:JSON.stringify(body)})
  try{
    const noToken=await fetch(url+'/todoist/data?resource=projects')
    assert.equal(noToken.status,409)
    const connected=await post('/todoist/connect',{token:'synthetic-todoist-key'})
    assert.equal(connected.status,200)
    const foreign=await fetch(url+'/todoist/data',{headers:{Origin:'https://attacker.invalid'}})
    assert.equal(foreign.status,403)
    const cross=await fetch(url+'/todoist/data',{headers:{'Sec-Fetch-Site':'cross-site'}})
    assert.equal(cross.status,403)
    const read=await fetch(url+'/todoist/data?resource=projects')
    assert.equal(read.status,200)
    assert.deepEqual((await read.json()).results,[{id:'p',name:'Demo'}])
    const pending=new Promise(resolve=>{resolvePending=resolve})
    dataFn=()=>pending
    const waiting=fetch(url+'/todoist/data?resource=projects')
    await new Promise(resolve=>setTimeout(resolve,25))
    await post('/todoist/disconnect')
    resolvePending({resource:'projects',results:[{id:'stale',name:'Should not leak'}],nextCursor:null})
    const stale=await waiting
    assert.equal(stale.status,409)
    await post('/todoist/connect',{token:'synthetic-todoist-key'})
    dataFn=async()=>{throw new TodoistReadError(401,'Token rejected')}
    const rejected=await fetch(url+'/todoist/data?resource=projects')
    assert.equal(rejected.status,401)
    const status=await (await fetch(url)).json()
    assert.equal(status.services.find(x=>x.id==='todoist').hasSessionToken,false)
  }finally{await new Promise(resolve=>server.close(resolve))}
})
