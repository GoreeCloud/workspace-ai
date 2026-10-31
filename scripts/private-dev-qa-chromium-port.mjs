// Pure parser for Chromium's disposable DevToolsActivePort file.
// Port selection is owned by Chrome; never permit hostnames or arbitrary paths.
export function chromiumDebugPortFromFile(contents) {
  if (typeof contents !== 'string' || contents.length > 1024) return null
  const lines = contents.split(/\r?\n/)
  if (!/^\d{4,5}$/.test(lines[0] || '')) return null
  if (!/^\/devtools\/browser\/[A-Za-z0-9-]{8,128}$/.test(lines[1] || '')) return null
  const port = Number(lines[0])
  return Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : null
}
