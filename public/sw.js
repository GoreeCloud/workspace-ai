/* Only the fixed public PWA metadata/icons may be cached. Never retain versioned build bundles, HTML, credentials, API, OAuth or conversations. */
const CACHE='goreecloud-workspace-public-v2'
const FILES=['/manifest.webmanifest','/favicon.svg','/icons/icon-192.png','/icons/icon-512.png']
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)));self.skipWaiting()})
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE&&k.startsWith('goreecloud-workspace-public-')).map(k=>caches.delete(k)))));self.clients.claim()})
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url)
 if(request.method!=='GET'||url.origin!==self.location.origin||url.search)return
 if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/auth/')||url.pathname==='/'||url.pathname==='/index.html')return
 if(!FILES.includes(url.pathname))return
 event.respondWith(fetch(request,{cache:'no-store'}).then(response=>{
  if(response.ok&&response.type==='basic'){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,copy)))}
  return response
 }).catch(()=>caches.match(request)))
})