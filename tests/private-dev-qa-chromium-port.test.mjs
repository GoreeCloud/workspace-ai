import test from 'node:test'
import assert from 'node:assert/strict'
import {chromiumDebugPortFromFile} from '../scripts/private-dev-qa-chromium-port.mjs'

const file = (port, suffix='b2a3d4e5-6123-4890-b456-927cc78658d1') =>
  String(port) + '\n/devtools/browser/' + suffix + '\n'

test('discover Chrome-selected debug port from LF and CRLF fixture files', () => {
  assert.equal(chromiumDebugPortFromFile(file(49152)), 49152)
  assert.equal(chromiumDebugPortFromFile(file(49152).replaceAll('\n','\r\n')), 49152)
  assert.equal(chromiumDebugPortFromFile(file(1024)), 1024)
  assert.equal(chromiumDebugPortFromFile(file(65535)), 65535)
})

test('reject malformed, out-of-range and non-browser Chromium debug files', () => {
  for(const invalid of [
    '', '127.0.0.1:49152', file(0),file(1023),file(65536),
    file('49152junk'),file(49152,'bad!suffix'),file(49152).replace('/devtools/browser/','/somewhere/'),
    '49152' + '\n' + 'http://attacker.test/', 'a'.repeat(1025)
  ]) assert.equal(chromiumDebugPortFromFile(invalid),null)
})
