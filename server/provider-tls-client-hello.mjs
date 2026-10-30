// Validate the plaintext TLS ClientHello before exposing an outbound socket.
// This does not decrypt TLS or inspect encrypted HTTP Host headers.
const LIMIT = 65536
const INCOMPLETE = 'incomplete'
const INVALID = 'invalid'
const VALID = 'valid'

function extractServerName(hello) {
  let pos = 0
  function read(length) {
    if (length < 0 || pos + length > hello.length) return null
    const value = hello.subarray(pos, pos + length)
    pos += length
    return value
  }
  const version = read(2)
  const random = read(32)
  const sessionLength = read(1)
  if (!version || !random || !sessionLength || !read(sessionLength[0])) return null
  const suiteLength = read(2)
  if (!suiteLength) return null
  const cipherSize = suiteLength.readUInt16BE(0)
  if (cipherSize < 2 || cipherSize % 2 || !read(cipherSize)) return null
  const compressionLength = read(1)
  if (!compressionLength || compressionLength[0] === 0 || !read(compressionLength[0])) return null
  const extensionsLength = read(2)
  if (!extensionsLength) return null
  const extensionBytes = extensionsLength.readUInt16BE(0)
  if (pos + extensionBytes !== hello.length) return null
  const end = pos + extensionBytes
  let found = null
  while (pos < end) {
    const extHeader = read(4)
    if (!extHeader) return null
    const type = extHeader.readUInt16BE(0)
    const size = extHeader.readUInt16BE(2)
    const contents = read(size)
    if (!contents) return null
    if (type !== 0) continue
    if (found !== null || contents.length < 5) return null
    const listSize = contents.readUInt16BE(0)
    if (listSize !== contents.length - 2) return null
    if (contents[2] !== 0) return null
    const nameSize = contents.readUInt16BE(3)
    if (nameSize < 1 || nameSize !== contents.length - 5) return null
    const name = contents.subarray(5)
    if (name.some(byte => byte < 0x21 || byte > 0x7e)) return null
    found = name.toString('ascii').toLowerCase()
  }
  return pos === end ? found : null
}

export function inspectTlsClientHello(data, expectedHostname) {
  if (!Buffer.isBuffer(data) || data.length > LIMIT || typeof expectedHostname !== 'string') return INVALID
  let pos = 0
  const records = []
  let bytes = 0
  while (pos < data.length) {
    if (data.length - pos < 5) return INCOMPLETE
    if (data[pos] !== 22 || data[pos + 1] !== 3 || data[pos + 2] > 4) return INVALID
    const length = data.readUInt16BE(pos + 3)
    if (length < 1 || length > 18432) return INVALID
    if (data.length - pos < 5 + length) return INCOMPLETE
    records.push(data.subarray(pos + 5, pos + 5 + length))
    bytes += length
    if (bytes > LIMIT) return INVALID
    const handshake = Buffer.concat(records, bytes)
    if (handshake.length >= 4) {
      if (handshake[0] !== 1) return INVALID
      const helloSize = handshake.readUIntBE(1, 3)
      if (helloSize < 40 || helloSize > LIMIT - 4) return INVALID
      if (handshake.length >= 4 + helloSize) {
        const serverName = extractServerName(handshake.subarray(4, 4 + helloSize))
        return serverName === expectedHostname.toLowerCase() ? VALID : INVALID
      }
    }
    pos += 5 + length
  }
  return INCOMPLETE
}
