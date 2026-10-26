// Abort a chat request if no stream activity arrives for a bounded interval.
// A VPN-only outage may leave navigator.onLine=true and a fetch reader pending.
// No retries are performed: the existing chat error path retains saved partials.
export const CHAT_STREAM_IDLE_TIMEOUT_MS = 120_000

export function createChatStreamWatchdog(
  controller,
  {idleMs = CHAT_STREAM_IDLE_TIMEOUT_MS, schedule = setTimeout, cancel = clearTimeout} = {}
) {
  if (!(controller instanceof AbortController) || !Number.isSafeInteger(idleMs) || idleMs < 1
    || typeof schedule !== 'function' || typeof cancel !== 'function') {
    throw Error('Invalid chat stream watchdog configuration.')
  }
  let timer = null
  let started = false
  let stopped = false
  let generation = 0
  const stop = () => {
    if (stopped) return
    stopped = true
    generation++
    if (timer !== null) cancel(timer)
    timer = null
    controller.signal.removeEventListener('abort', stop)
  }
  const arm = () => {
    if (stopped || controller.signal.aborted) return false
    if (timer !== null) cancel(timer)
    const current = ++generation
    timer = schedule(() => {
      if (current !== generation) return
      timer = null
      if (!stopped && !controller.signal.aborted) controller.abort('stream-inactive')
    }, idleMs)
    return true
  }
  controller.signal.addEventListener('abort', stop, {once: true})
  return {
    start() {
      if (started) return false
      started = true
      return arm()
    },
    activity() {return started && arm()},
    stop
  }
}
