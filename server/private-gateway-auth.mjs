// Development-only, file-backed authentication between the private ingress gateway
// and the Workspace AI backend. Browser Host/Origin headers are not peer identity.
import {constants, closeSync, fstatSync, openSync, readFileSync} from 'node:fs'
import {timingSafeEqual} from 'node:crypto'

export const GATEWAY_TOKEN_HEADER = 'x-goreecloud-gateway-token'

export function loadPrivateGatewayToken(env = process.env) {
  const required = env.WORKSPACE_AI_PRIVATE_DEV_GATEWAY_REQUIRED
  const filename = env.WORKSPACE_AI_PRIVATE_DEV_GATEWAY_TOKEN_FILE
  if (!required && !filename) return null
  if (required !== 'true' || !filename ||
      env.WORKSPACE_AI_PRIVATE_DEV_ENABLED !== 'true' ||
      env.WORKSPACE_AI_PRIVATE_DEV_BIND_ALL !== 'true' ||
      env.WORKSPACE_AI_PRIVATE_DEV_ISOLATED_CONTAINER !== 'true') {
    throw new Error('Private gateway authentication requires explicit isolated development configuration and a token file')
  }
  if (!filename.startsWith('/') || filename.includes('\0')) {
    throw new Error('Private gateway token file must use an absolute path')
  }
  let fd
  try {
    fd = openSync(filename, constants.O_RDONLY | constants.O_NOFOLLOW)
    const stat = fstatSync(fd)
    if (!stat.isFile() || ![64, 65].includes(stat.size) || (stat.mode & 0o077) !== 0) {
      throw new Error('Private gateway token must be a restricted regular file containing 32 random bytes in hex')
    }
    const value = readFileSync(fd, 'utf8').trim()
    if (!/^[a-fA-F0-9]{64}$/.test(value)) {
      throw new Error('Private gateway token must be exactly 32 random bytes in hex')
    }
    return Buffer.from(value, 'hex')
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}

export function matchesPrivateGatewayToken(expected, candidate) {
  if (!expected) return true
  if (typeof candidate !== 'string' || !/^[a-fA-F0-9]{64}$/.test(candidate)) return false
  return timingSafeEqual(expected, Buffer.from(candidate, 'hex'))
}
