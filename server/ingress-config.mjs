// Strict opt-in development ingress. Production/default installations remain loopback-only.
const DEV_ORIGIN = 'https://workspace-ai-dev.goreecloud.com'

export function resolveIngress(env = process.env) {
  const portValue = String(env.WORKSPACE_AI_PORT || '3031')
  if (!/^[0-9]+$/.test(portValue)) throw new Error('Invalid WORKSPACE_AI_PORT')
  const port = Number(portValue)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid WORKSPACE_AI_PORT')

  const enabled = env.WORKSPACE_AI_PRIVATE_DEV_ENABLED === 'true'
  if (env.WORKSPACE_AI_PRIVATE_DEV_ENABLED && !['true', 'false'].includes(env.WORKSPACE_AI_PRIVATE_DEV_ENABLED)) {
    throw new Error('Invalid WORKSPACE_AI_PRIVATE_DEV_ENABLED')
  }
  if (!enabled && (env.WORKSPACE_AI_PRIVATE_DEV_ORIGIN || env.WORKSPACE_AI_PRIVATE_DEV_BIND_ALL || env.WORKSPACE_AI_PRIVATE_DEV_ISOLATED_CONTAINER)) {
    throw new Error('Private development settings require WORKSPACE_AI_PRIVATE_DEV_ENABLED=true')
  }

  const localOrigin = 'http://127.0.0.1:' + port
  if (!enabled) return {
    port, privateDev: false, bindHost: '127.0.0.1', clientOrigin: localOrigin,
    allowedHosts: new Set(['127.0.0.1:' + port]),
    allowedOrigins: new Set([localOrigin, 'http://127.0.0.1:5173'])
  }

  if (env.WORKSPACE_AI_PRIVATE_DEV_ORIGIN !== DEV_ORIGIN) {
    throw new Error('Private development origin must exactly match the approved HTTPS hostname')
  }
  const bindAll = env.WORKSPACE_AI_PRIVATE_DEV_BIND_ALL === 'true'
  if (env.WORKSPACE_AI_PRIVATE_DEV_BIND_ALL && !['true', 'false'].includes(env.WORKSPACE_AI_PRIVATE_DEV_BIND_ALL)) {
    throw new Error('Invalid WORKSPACE_AI_PRIVATE_DEV_BIND_ALL')
  }
  if (bindAll && env.WORKSPACE_AI_PRIVATE_DEV_ISOLATED_CONTAINER !== 'true') {
    throw new Error('Binding private development ingress requires an explicitly isolated container')
  }
  return {
    port, privateDev: true, bindHost: bindAll ? '0.0.0.0' : '127.0.0.1',
    clientOrigin: DEV_ORIGIN,
    allowedHosts: new Set(['workspace-ai-dev.goreecloud.com']),
    allowedOrigins: new Set([DEV_ORIGIN])
  }
}
