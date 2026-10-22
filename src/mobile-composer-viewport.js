// Keep the chat composer in the visible viewport when mobile virtual keyboards
// overlay the layout viewport (notably Android Firefox).
const HEIGHT_VAR = '--gc-mobile-composer-viewport-height'

export function mobileComposerHeight({width, focused, height, top = 0}) {
  if (!focused || width > 800 || !Number.isFinite(height) || height < 180) return null
  return `${Math.round(height + Math.max(0, top))}px`
}

export function installMobileComposerViewport(win = window, doc = document) {
  const viewport = win.visualViewport
  if (!viewport) return () => {}
  const update = () => {
    const value = mobileComposerHeight({
      width: win.innerWidth,
      focused: Boolean(doc.activeElement?.closest?.('.composer')),
      height: viewport.height,
      top: viewport.offsetTop || 0,
    })
    if (value) doc.documentElement.style.setProperty(HEIGHT_VAR, value)
    else doc.documentElement.style.removeProperty(HEIGHT_VAR)
  }
  viewport.addEventListener('resize', update)
  viewport.addEventListener('scroll', update)
  win.addEventListener('resize', update)
  doc.addEventListener('focusin', update)
  doc.addEventListener('focusout', update)
  update()
  return () => {
    viewport.removeEventListener('resize', update)
    viewport.removeEventListener('scroll', update)
    win.removeEventListener('resize', update)
    doc.removeEventListener('focusin', update)
    doc.removeEventListener('focusout', update)
    doc.documentElement.style.removeProperty(HEIGHT_VAR)
  }
}
