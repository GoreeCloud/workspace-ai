import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'

const source=readFileSync(fileURLToPath(new URL('../scripts/private-dev-protected-runtime-check.sh',import.meta.url)),'utf8')

test('protected runtime acceptance remains read-only and secret-free',()=>{
  assert.match(source,/set -euo pipefail/)
  assert.match(source,/never prints an owner\/gateway credential/)
  assert.doesNotMatch(source,/\bdocker\s+(?:run|rm|kill|stop|restart|network\s+create|compose\s+up)\b/)
  assert.doesNotMatch(source,/\bsudo\b/)
  assert.doesNotMatch(source,/\b(?:cat|head|tail)\b[^\n]*(?:password|secret|gateway\.token)/i)
})

test('protected runtime acceptance checks isolation and negative HTTP paths',()=>{
  for(const text of [
    'ReadonlyRootfs',
    'PortBindings',
    'CapDrop',
    'SecurityOpt',
    'WORKSPACE_AI_PRIVATE_DEV_GATEWAY_REQUIRED=true',
    'WORKSPACE_AI_PRIVATE_DEV_GATEWAY_TOKEN_FILE=',
    'goreecloud-workspace-ai-private-ingress',
    'goreecloud-workspace-ai-private-dev_private_smoke',
    'X-GoreeCloud-Gateway-Token: deliberately-invalid-qa-token',
    "test \"$code\" = 403",
    "test \"$bridge\" = '403 0'"
  ]) assert.ok(source.includes(text),`missing acceptance contract: ${text}`)
  assert.match(source,/--resolve\s+"\$host:443:127\.0\.0\.1"/)
  assert.match(source,/owner-authenticated browser.*separate gates/)
})
