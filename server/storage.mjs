import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const directory = path.join(os.homedir(), '.config', 'workspace-ai')
const filename = path.join(directory, 'credentials.json')

export async function readProfile() {
  try {
    const value = JSON.parse(await fs.readFile(filename, 'utf8'))
    return value && typeof value === 'object' ? value : {}
  } catch (error) {
    if (error.code === 'ENOENT') return {}
    throw error
  }
}

export async function saveProfile(value) {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 })
  await fs.chmod(directory, 0o700)
  const temporary = path.join(directory, '.credentials-' + randomUUID())
  try {
    await fs.writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
    await fs.rename(temporary, filename)
    await fs.chmod(filename, 0o600)
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {})
  }
}

export async function getHostId() {
  const record = await readProfile()
  if (typeof record.host_id === 'string' && /^urn:uuid:/.test(record.host_id)) return record.host_id
  const host_id = 'urn:uuid:' + randomUUID()
  await saveProfile({ ...record, host_id })
  return host_id
}

export async function updateProfile(transform) {
  const old = await readProfile()
  const next = transform(old)
  await saveProfile(next)
  return next
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
