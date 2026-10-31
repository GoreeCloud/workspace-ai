// This fixture is loaded only by a synthetic child-server test. No network calls.
const endpoint = 'https://api.openai.com/v1/responses'
globalThis.fetch = (url, options = {}) => {
  if (String(url) !== endpoint) return Promise.reject(new Error('Synthetic fixture blocks outbound fetch'))
  return new Promise((resolve, reject) => {
    const aborted = () => reject(new DOMException('Synthetic inference cancelled', 'AbortError'))
    if (options.signal?.aborted) return aborted()
    options.signal?.addEventListener('abort', aborted, {once:true})
  })
}
