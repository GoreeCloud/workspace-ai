import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'

const read = name => readFile(fileURLToPath(new URL('../deploy/private-dev/' + name,import.meta.url)), 'utf8')

test('private development smoke container is not exposed or provisioned with credentials', async () => {
  const yaml = await read('compose.yaml')
  assert.match(yaml,/internal:\s*true/)
  assert.match(yaml,/ports:\s*\[\]/)
  assert.match(yaml,/read_only:\s*true/)
  assert.match(yaml,/no-new-privileges:true/)
  assert.match(yaml,/cap_drop:\s*\n\s*- ALL/)
  assert.match(yaml,/WORKSPACE_AI_PRIVATE_DEV_ENABLED:\s*["']?true/)
  assert.doesNotMatch(yaml,/OPENAI_API_KEY\s*:/)
  assert.doesNotMatch(yaml,/WORKSPACE_AI_AGENT_OWNER_KEY\s*:/)
  assert.doesNotMatch(yaml,/\.env\b/)
})

test('private ingress is review-only and cannot work without external network setup', async () => {
  const override = await read('compose.ingress.yaml')
  assert.match(override,/REVIEW-ONLY/)
  assert.match(override,/external:\s*true/)
  assert.match(override,/name:\s*goreecloud-workspace-ai-private-ingress/)
  assert.doesNotMatch(override,/\bports\s*:/)
  assert.doesNotMatch(override,/\bnetwork_mode\s*:/)
  const proxy=await read('Caddyfile.private.example')
  assert.match(proxy,/REVIEW-ONLY/)
  assert.match(proxy,/^workspace-ai-dev\.goreecloud\.com \{/m)
  assert.match(proxy,/@netbird_client remote_ip 100\.64\.0\.0\/10/)
  assert.match(proxy,/handle @netbird_client/)
  assert.match(proxy,/basic_auth \{/)
  assert.match(proxy,/goreecloud \{\$WORKSPACE_AI_DEV_BCRYPT_HASH\}/)
  assert.match(proxy,/reverse_proxy workspace-ai-private-dev:3031/)
  assert.match(proxy,/header_up -Authorization/)
  assert.match(proxy,/header_up -Proxy-Authorization/)
  assert.match(proxy,/respond "Forbidden" 403/)
  assert.doesNotMatch(proxy,/tls\s+internal/)
  assert.doesNotMatch(proxy,/\bforward_auth\b/)
})

test('private ingress must not be included in default local app configuration', async () => {
  const code=await readFile(fileURLToPath(new URL('../server/ingress-config.mjs',import.meta.url)),'utf8')
  assert.match(code,/WORKSPACE_AI_PRIVATE_DEV_ENABLED/)
  assert.match(code,/bindHost: '127\.0\.0\.1'/)
  assert.match(code,/approved HTTPS hostname/)
})

test('synthetic HTTPS QA gateway cannot be mistaken for the live VPN Caddy route', async () => {
  const qa=await read('Caddyfile.synthetic-qa')
  assert.match(qa,/SYNTHETIC QA ONLY/)
  assert.match(qa,/tls internal/)
  assert.match(qa,/@qa_clients remote_ip 172\.16\.0\.0\/12/)
  assert.match(qa,/basic_auth \{/)
  assert.match(qa,/synthetic-qa \{\$WORKSPACE_AI_SYNTHETIC_BCRYPT_HASH\}/)
  assert.match(qa,/reverse_proxy workspace-ai-private-dev:3031/)
  assert.match(qa,/header_up -Authorization/)
  assert.match(qa,/respond "Forbidden" 403/)
  assert.doesNotMatch(qa,/100\.64\.0\.0\/10/)
  const check=await readFile(fileURLToPath(new URL('../scripts/private-dev-qa-gateway-check.sh',import.meta.url)),'utf8')
  assert.match(check,/--cacert/)
  assert.match(check,/--resolve/)
  assert.match(check,/wrong credential denial/)
  assert.doesNotMatch(check,/--insecure|curl\s+-k\b/)
})
