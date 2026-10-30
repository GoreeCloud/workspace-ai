import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const workflows = ['checks.yml', 'private-dev-https-qa.yml', 'desktop-packages.yml']

test('CI workflows pin supported Node 24 compatible GitHub Actions', async () => {
  for (const name of workflows) {
    const body = await readFile(new URL('../.github/workflows/' + name, import.meta.url), 'utf8')
    assert.match(body, /actions\/checkout@v7/)
    assert.doesNotMatch(body, /actions\/checkout@v[1-6]\b/)
    if (body.includes('actions/setup-node@')) {
      assert.match(body, /actions\/setup-node@v7/)
      assert.doesNotMatch(body, /actions\/setup-node@v[1-6]\b/)
    }
  }
})
