// Validates authorization via OpenAI's model catalog (GET only).
// This performs no Responses/inference request and does not incur token charges.
export async function verifyApiKey(key, { fetchImpl = fetch, timeoutMs = 10000 } = {}) {
  if (typeof key !== 'string' || !key.trim()) {
    return { state: 'missing', message: 'No API key is configured.' }
  }
  try {
    const response = await fetchImpl('https://api.openai.com/v1/models', {
      method: 'GET',
      redirect: 'error',
      headers: { Authorization: 'Bearer ' + key },
      signal: AbortSignal.timeout(timeoutMs)
    })
    if (response.ok) {
      return { state: 'verified', message: 'OpenAI accepted this key for listing models. Inference permissions and billing were not tested.' }
    }
    if (response.status === 401) {
      return { state: 'invalid', message: 'OpenAI rejected this key (HTTP 401). Check whether it has been revoked or mistyped.' }
    }
    if (response.status === 403) {
      return { state: 'restricted', message: 'OpenAI denied model-list access (HTTP 403). Check project or key permissions.' }
    }
    return { state: 'unavailable', message: 'The OpenAI model-list check returned HTTP ' + response.status + '. Retry later or check your project settings.' }
  } catch (error) {
    // Report network categories without echoing URLs, credentials or raw errors.
    const code = error?.cause?.code || error?.code
    if (code === 'EAI_AGAIN' || code === 'ENOTFOUND')
      return { state: 'unavailable', message: 'The Workspace AI server could not resolve api.openai.com. Check container DNS and the outbound network policy; the saved key has not been validated.' }
    if (['ENETUNREACH', 'EHOSTUNREACH', 'ETIMEDOUT'].includes(code) || error?.name === 'TimeoutError')
      return { state: 'unavailable', message: 'The Workspace AI server cannot reach the OpenAI API. Check the private deployment outbound policy; the saved key has not been validated.' }
    return { state: 'unavailable', message: 'The Workspace AI server could not complete the OpenAI connection check. The key is unverified; inspect server connectivity and retry.' }
  }
}
