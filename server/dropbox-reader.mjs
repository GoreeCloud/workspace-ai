// Dropbox API v2 read-only folder metadata browser. No file contents or mutation.
export class DropboxReadError extends Error {
  constructor(status, message) { super(message); this.name = 'DropboxReadError'; this.status = status }
}
const text = (v, limit = 240) => typeof v === 'string' ? v.slice(0, limit) : ''
const validPath = path => typeof path === 'string' && path.length <= 1024 &&
  (path === '' || (path.startsWith('/') && !/[\x00-\x1f\x7f\\]/.test(path) &&
    !path.split('/').some(segment => segment === '..' || segment === '.')))
const validCursor = cursor => typeof cursor === 'string' && cursor.length > 0 &&
  cursor.length <= 2048 && !/[\x00-\x1f\x7f]/.test(cursor)

export async function readDropboxFolder(token, {path = '', cursor} = {}, fetchImpl = fetch) {
  if (typeof token !== 'string' || !token.trim()) throw new DropboxReadError(409,'Connect Dropbox first.')
  if (token.length > 2048 || /\s/.test(token)) throw new DropboxReadError(400,'Invalid Dropbox credential.')
  if (!validPath(path)) throw new DropboxReadError(400,'Invalid Dropbox folder path.')
  if (cursor !== undefined && !validCursor(cursor)) throw new DropboxReadError(400,'Invalid Dropbox pagination cursor.')
  const url = 'https://api.dropboxapi.com/2/files/list_folder' + (cursor ? '/continue' : '')
  const body = cursor ? {cursor} : {path, recursive:false, include_deleted:false, limit:50}
  let response
  try {
    response = await fetchImpl(url,{
      method:'POST', redirect:'error', signal:AbortSignal.timeout(10000),
      headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json'},
      body:JSON.stringify(body)
    })
  } catch {
    throw new DropboxReadError(503,'Dropbox could not be reached. Retry later.')
  }
  if (!response.ok) {
    if (response.status === 401) throw new DropboxReadError(401,'Dropbox rejected this session credential.')
    if (response.status === 403) throw new DropboxReadError(403,'Dropbox denied access to this folder.')
    if (response.status === 409) throw new DropboxReadError(409,'This Dropbox folder or cursor is no longer available.')
    throw new DropboxReadError(503,'Dropbox could not return this folder listing.')
  }
  let result
  try { result = await response.json() } catch {throw new DropboxReadError(502,'Dropbox returned unreadable metadata.')}
  if (!Array.isArray(result?.entries)) throw new DropboxReadError(502,'Dropbox returned unexpected metadata.')
  const entries = result.entries.slice(0,50).filter(item => item?.['.tag'] === 'file' || item?.['.tag'] === 'folder')
    .map(item=>({
      type:item['.tag'],name:text(item.name,250),
      path:text(item.path_display,1024),
      size:item['.tag']==='file' && Number.isSafeInteger(item.size)?item.size:null,
      modified:text(item.server_modified,40)
    })).filter(item=>item.name && validPath(item.path))
  const nextCursor = result.has_more === true && validCursor(result.cursor) ? result.cursor : null
  return {path:cursor?null:path,entries,nextCursor,readOnly:true}
}
