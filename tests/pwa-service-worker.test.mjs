import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {runInNewContext} from 'node:vm'

test('PWA service worker caches only fixed public install assets and cleans old cache versions', async () => {
  const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8')
  const handlers = new Map()
  const cached = [], requests = [], deleted = []
  let installed = false, claimed = false
  const cache = {
    async addAll(paths) { cached.push(...paths.map(path => ({precache: path}))) },
    async put(request) { cached.push({url: request.url}) }
  }
  const context = {
    URL,
    self: {
      location: {origin: 'http://127.0.0.1:3031'},
      addEventListener(name, handler) { handlers.set(name, handler) },
      skipWaiting() { installed = true },
      clients: {claim() { claimed = true }}
    },
    caches: {
      open: async () => cache,
      keys: async () => ['goreecloud-workspace-public-v1', 'goreecloud-workspace-public-v2', 'unrelated-cache'],
      delete: async key => { deleted.push(key); return true },
      match: async () => undefined
    },
    fetch: async (request, options) => {
      requests.push({url: request.url, options})
      return {ok: true, type: 'basic', clone() { return this }}
    }
  }
  runInNewContext(source, context)

  const lifecycle = async name => {
    const waiting = []
    handlers.get(name)({waitUntil: promise => waiting.push(promise)})
    await Promise.all(waiting)
  }
  await lifecycle('install')
  assert.equal(installed, true)
  assert.equal(cached.length, 4)
  assert.deepEqual(cached.map(item => item.precache), [
    '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png', '/icons/icon-512.png'
  ])
  await lifecycle('activate')
  assert.equal(claimed, true)
  assert.deepEqual(deleted, ['goreecloud-workspace-public-v1'])

  const request = async (path, method = 'GET') => {
    const waiting = []
    let response
    handlers.get('fetch')({
      request: {url: path.startsWith('http') ? path : 'http://127.0.0.1:3031' + path, method},
      respondWith(promise) { response = promise },
      waitUntil(promise) { waiting.push(promise) }
    })
    if (response) await response
    await Promise.all(waiting)
    return Boolean(response)
  }
  for (const path of ['/', '/index.html', '/assets/index-old.js', '/assets/main-new.css',
    '/api/chat', '/auth/callback', '/icons/icon-512.png?secret=1',
    'https://external.example/icons/icon-512.png']) {
    assert.equal(await request(path), false, path + ' must bypass the PWA cache')
  }
  assert.equal(await request('/favicon.svg', 'POST'), false)
  assert.equal(requests.length, 0)
  assert.equal(await request('/favicon.svg'), true)
  assert.equal(requests.length, 1)
  assert.equal(requests[0].options.cache, 'no-store')
  assert.equal(cached.filter(entry => entry.url).length, 1)
})
