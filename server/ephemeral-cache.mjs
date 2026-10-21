// In-process, bounded, single-flight cache for non-sensitive, account-scoped metadata.
// No disk writes, no negative caching and no retention beyond the current server process.
export function createEphemeralCache({ttlMs=60_000,maxEntries=24,clock=Date.now}={}) {
  if (!Number.isSafeInteger(ttlMs)||ttlMs<1||ttlMs>3_600_000||
      !Number.isSafeInteger(maxEntries)||maxEntries<1||maxEntries>256) throw Error('Invalid cache limits')
  const values=new Map(),pending=new Map()
  let generation=0
  function prune() {
    const now=clock()
    for (const [key,entry] of values) if(entry.expiresAt<=now) values.delete(key)
    while(values.size>maxEntries) values.delete(values.keys().next().value)
  }
  return {
    async load(key,loader) {
      if(typeof key!=='string'||!key||key.length>200||typeof loader!=='function')throw Error('Invalid cache request')
      const cached=values.get(key)
      if(cached&&cached.expiresAt>clock()) {
        values.delete(key);values.set(key,cached)
        return cached.value
      }
      values.delete(key)
      if(pending.has(key)) return pending.get(key)
      const issued=generation
      const job=Promise.resolve().then(loader).then(value=>{
        if(issued===generation){
          values.set(key,{value,expiresAt:clock()+ttlMs})
          prune()
        }
        return value
      }).finally(()=>{if(pending.get(key)===job)pending.delete(key)})
      pending.set(key,job)
      return job
    },
    clear(){generation++;values.clear();pending.clear()},
    stats(){prune();return {entries:values.size,inFlight:pending.size}}
  }
}
