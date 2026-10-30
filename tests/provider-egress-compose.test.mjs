import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const load = name => readFile(new URL('../deploy/private-dev/' + name, import.meta.url), 'utf8')
test('provider overlay keeps the workspace on its internal network', async () => {
 const [base,overlay] = await Promise.all([load('compose.yaml'),load('compose.provider-egress.yaml')])
 assert.match(base,/internal:\s*true/)
 assert.match(overlay,/NODE_USE_ENV_PROXY:/)
 assert.match(overlay,/HTTPS_PROXY:/)
 assert.match(overlay,/provider_outbound:/)
 assert.match(overlay,/ports:\s*\[\]/)
 assert.doesNotMatch(overlay,/OPENAI_API_KEY/)
})
