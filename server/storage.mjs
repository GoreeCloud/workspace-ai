import { randomUUID } from 'node:crypto'
import { constants as fsConstants, promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const directory = path.join(os.homedir(), '.config', 'workspace-ai')
const filename = path.join(directory, 'credentials.json')
const MAX_PROFILE_BYTES = 512 * 1024

// Credentials must never be read through a symlink or from a group/world
// accessible file. Use O_NOFOLLOW plus fstat to avoid a check/open race.
export async function readProfile() {
  try {
    const folder = await fs.lstat(directory)
    if (!folder.isDirectory() || (folder.mode & 0o077)) {
      throw new Error('Workspace credentials directory must be private (0700), not a symlink.')
    }
    const handle = await fs.open(filename, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW || 0))
    try {
      const details = await handle.stat()
      if (!details.isFile() || (details.mode & 0o077)) {
        throw new Error('Workspace credentials must be a private regular file (0600).')
      }
      if (details.size > MAX_PROFILE_BYTES) {
        throw new Error('Workspace credentials profile exceeds the safety size limit.')
      }
      const value = JSON.parse(await handle.readFile('utf8'))
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
    } finally {
      await handle.close()
    }
  } catch (error) {
    if (error.code === 'ENOENT') return {}
    throw error
  }
}

export async function saveProfile(value) {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 })
  const folder = await fs.lstat(directory)
  if (!folder.isDirectory()) throw new Error('Refusing a symlinked workspace credentials directory.')
  await fs.chmod(directory, 0o700)
  const temporary = path.join(directory, '.credentials-' + randomUUID())
  try {
    const serialized = JSON.stringify(value, null, 2) + '\n'
    if (Buffer.byteLength(serialized, 'utf8') > MAX_PROFILE_BYTES) {
      throw new Error('Workspace credentials profile exceeds the safety size limit.')
    }
    await fs.writeFile(temporary, serialized, { mode: 0o600, flag: 'wx' })
    await fs.rename(temporary, filename)
    await fs.chmod(filename, 0o600)
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {})
  }
}

// Serialize in-process profile read/modify/write transactions. Atomic rename
// protects file integrity but cannot prevent concurrent readers losing updates.
let profileWrites = Promise.resolve()

export function updateProfile(transform) {
  const operation = profileWrites.then(async () => {
    const old = await readProfile()
    const next = transform(old)
    if (next !== old) await saveProfile(next)
    return next
  })
  // One failed transaction must not block subsequent authorized updates.
  profileWrites = operation.then(() => undefined, () => undefined)
  return operation
}

export async function getHostId() {
  const profile = await updateProfile(record => {
    if (typeof record.host_id === 'string' && /^urn:uuid:/.test(record.host_id)) return record
    return { ...record, host_id: 'urn:uuid:' + randomUUID() }
  })
  return profile.host_id
}

export function publicStatus(profile, apiConfigured = false) {
  const account = profile.account
  return {
    connected: Boolean(account?.subject && account?.access_token),
    planEnabled: Boolean(account?.scopes?.includes('chatgpt.tokens.use.direct')),
    email: account?.email || null,
    apiConfigured,
    model: process.env.OPENAI_API_MODEL || 'gpt-5-mini'
  }
}
