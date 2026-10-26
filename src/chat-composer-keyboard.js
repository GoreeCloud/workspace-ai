// Preserve multiline input on mobile devices and while an IME is composing.
// Desktop Enter sends; Shift+Enter always inserts a line break.
export function shouldSendOnComposerEnter(event, {mobileViewport = false, coarsePointer = false} = {}) {
  if (event?.key !== 'Enter' || event.shiftKey || event.isComposing || event.nativeEvent?.isComposing) return false
  if (event.keyCode === 229 || mobileViewport || coarsePointer) return false
  return true
}
