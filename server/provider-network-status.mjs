// Report configuration readiness, never claim an external connection was tested.
export function providerNetworkStatus(env = process.env, privateDev = false) {
  if (!privateDev) return 'local'
  return env.NODE_USE_ENV_PROXY === '1' &&
    env.HTTPS_PROXY === 'http://provider-proxy:3128'
    ? 'configured' : 'disabled'
}
