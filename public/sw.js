/* Only immutable public assets are cached; all user data bypasses the service worker. */
const CACHE='goreecloud-workspace-public-v2'
const FILES=['/manifest.webmanifest','/favicon.svg','/icons/icon-192.png','/icons/icon-512.png']
const MAX_ASSETS=48
const isFingerprintAsset=path=>path.startsWith('/assets/') && /-[A-Za-z0-9_-]{8,}\.(js|css|svg|png|webp|woff2)$/.test(path)
async function store(request,response,asset=false) {
 if(!response.ok || response.type!=='basic')return
 const cache=await caches.open(CACHE)
 await cache.put(request,response.clone())
 if(asset){
  const assets=(await cache.keys()).filter(item=>isFingerprintAsset(new URL(item.url).pathname))
  await Promise.all(assets.slice(0,Math.max(0,assets.length-MAX_ASSETS)).map(item=>cache.delete(item)))
 }
}
async function cacheFirst(request,event){
 const cached=await caches.match(request)
 if(cached)return cached
 const response=await fetch(request)
 if(response.ok)event.waitUntil(store(request,response,true))
 return response
}
async function networkFirst(request,event){
 try {
  const response=await fetch(request,{cache:'no-store'})
  if(response.ok)event.waitUntil(store(request,response))
  return response
 }catch(error) {
  const cached=await caches.match(request)
  if(cached)return cached
  throw error
 }
}
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)))
 self.skipWaiting()
})
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE&&key.startsWith('goreecloud-workspace-public-')).map(key=>caches.delete(key)))))
 self.clients.claim()
})
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url)
 if(request.method!=='GET'||url.origin!==self.location.origin||url.search)return
 if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/auth/')||url.pathname==='/'||url.pathname==='/index.html')return
 if(isFingerprintAsset(url.pathname))event.respondWith(cacheFirst(request,event))
 else if(FILES.includes(url.pathname))event.respondWith(networkFirst(request,event))
})
