// Keep gateway/proxy error pages out of UI messages and provide actionable
// diagnostics when a private ingress returns HTML instead of the API's JSON.
const INVALID_RESPONSE = 'Workspace AI received an invalid server response. Reload the page and try again.'

export function apiFailureMessage(status, fallback = 'Request failed') {
  if (status === 401) return 'Workspace AI needs authentication (HTTP 401). Sign in on the secure site and retry.'
  if (status === 403) return 'Workspace AI access was denied (HTTP 403). Check your private network and account access.'
  if ([502, 503, 504].includes(status)) return 'Workspace AI is temporarily unavailable (HTTP ' + status + '). Check the connection and retry.'
  if (Number.isInteger(status) && status >= 400 && status <= 599) return fallback + ' (HTTP ' + status + ').'
  return fallback + '.'
}

export async function readApiResponse(response, fallback = 'Request failed') {
  if (!response || typeof response.json !== 'function') throw Error(INVALID_RESPONSE)
  let data
  try { data = await response.json() }
  catch { throw Error(response.ok ? INVALID_RESPONSE : apiFailureMessage(response.status, fallback)) }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw Error(response.ok ? INVALID_RESPONSE : apiFailureMessage(response.status, fallback))
  }
  if (!response.ok) {
    // Never surface HTML bodies or unbounded provider/gateway payloads.
    const safeError = typeof data.error === 'string' ? data.error.trim().slice(0, 300) : ''
    throw Error(safeError || apiFailureMessage(response.status, fallback))
  }
  return data
}
