import test from 'node:test'
import assert from 'node:assert/strict'
import { inspectTlsClientHello } from '../server/provider-tls-client-hello.mjs'

const u16 = value => Buffer.from([value >>> 8, value & 255])
const u24 = value => Buffer.from([value >>> 16, (value >>> 8) & 255, value & 255])
const frame = data => Buffer.concat([Buffer.from([22, 3, 1]), u16(data.length), data])

function clientHello(name = 'api.openai.com', { withoutSni = false } = {}) {
  const nameBytes = Buffer.from(name, 'ascii')
  const list = Buffer.concat([Buffer.from([0]), u16(nameBytes.length), nameBytes])
  const sniBody = Buffer.concat([u16(list.length), list])
  const sniExtension = Buffer.concat([u16(0), u16(sniBody.length), sniBody])
  const extensions = withoutSni ? Buffer.alloc(0) : sniExtension
  const body = Buffer.concat([
    Buffer.from([3, 3]), Buffer.alloc(32, 42), Buffer.from([0]),
    Buffer.from([0, 2, 0x13, 0x01]),
    Buffer.from([1, 0]),
    u16(extensions.length), extensions
  ])
  return Buffer.concat([Buffer.from([1]), u24(body.length), body])
}

test('matching visible TLS SNI is admitted, wrong or missing SNI denied', () => {
  const valid = frame(clientHello())
  assert.equal(inspectTlsClientHello(valid, 'api.openai.com'), 'valid')
  assert.equal(inspectTlsClientHello(valid, 'auth.openai.com'), 'invalid')
  assert.equal(inspectTlsClientHello(frame(clientHello('evil.example')), 'api.openai.com'), 'invalid')
  assert.equal(inspectTlsClientHello(frame(clientHello('api.openai.com', {withoutSni:true})), 'api.openai.com'), 'invalid')
})

test('partial records and fragmented ClientHello remain pending until complete', () => {
  const original = clientHello()
  const split = Buffer.concat([frame(original.subarray(0, 17)), frame(original.subarray(17))])
  assert.equal(inspectTlsClientHello(split, 'api.openai.com'), 'valid')
  for (const limit of [0, 2, 4, 5, 9, 20, split.length - 1]) {
    assert.equal(inspectTlsClientHello(split.subarray(0, limit), 'api.openai.com'), 'incomplete')
  }
})

test('non TLS input and malformed, large or truncated records fail closed', () => {
  assert.equal(inspectTlsClientHello(Buffer.from('GET / HTTP/1.1'), 'api.openai.com'), 'invalid')
  const invalid = frame(clientHello())
  invalid[0] = 23
  assert.equal(inspectTlsClientHello(invalid, 'api.openai.com'), 'invalid')
  assert.equal(inspectTlsClientHello(Buffer.alloc(65537), 'api.openai.com'), 'invalid')
  const tooLarge = Buffer.from([22,3,1,0xff,0xff])
  assert.equal(inspectTlsClientHello(tooLarge, 'api.openai.com'), 'invalid')
})

export { frame, clientHello }
