// Keep only the newest provider snapshot. Network events can race with
// initial loading, manual retries, and browser visibility changes.
export function createConnectionRefresher({readStatus,readModels,publish}) {
  if (typeof readStatus !== 'function' || typeof readModels !== 'function' || typeof publish !== 'function')
    throw Error('Invalid connection refresh handlers')
  let sequence = 0
  const markUnavailable = message => {
    sequence++ // Invalidate all in-flight responses when the browser goes offline.
    publish({status:{connected:false,planEnabled:false,apiConfigured:false,model:''},models:[],
      connectionError:String(message||'Connection unavailable.').slice(0,300),modelError:''})
  }
  async function refreshConnection() {
    const request = ++sequence
    try {
      const status = await readStatus()
      if (!status || typeof status !== 'object' || typeof status.planEnabled !== 'boolean' || typeof status.apiConfigured !== 'boolean')
        throw Error('The server returned an invalid connection status.')
      let models = []
      let modelError = ''
      if (status.planEnabled) {
        try {
          const response = await readModels()
          if (!response || !Array.isArray(response.planModels)) throw Error('Invalid model list.')
          models = response.planModels
          if (typeof response.error === 'string') modelError = response.error.slice(0, 300)
        } catch {
          modelError = 'ChatGPT plan models are temporarily unavailable. Refresh the connection to retry.'
        }
      }
      if (request !== sequence) return false
      publish({status,models,connectionError:'',modelError})
      return true
    } catch (error) {
      if (request !== sequence) return false
      const message = error instanceof Error ? error.message : 'Unable to reach Workspace AI.'
      // A stale "connected" provider must never remain usable after a failed status check.
      publish({status:{connected:false,planEnabled:false,apiConfigured:false,model:''},models:[],
        connectionError:message.slice(0,300),modelError:''})
      return false
    }
  }
  refreshConnection.offline = () => markUnavailable('Browser is offline. Reconnect to your private network and retry.')
  return refreshConnection
}
