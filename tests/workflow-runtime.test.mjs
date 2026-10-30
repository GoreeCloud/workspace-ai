import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const names = ['checks.yml', 'private-dev-https-qa.yml', 'desktop-packages.yml']

test('all Workspace AI CI workflows use supported Node 24 GitHub Actions', async () => {
  for (const name of names) {
    const text = await readFile(new URL('../.github/workflows/' + name, import.meta.url), 'utf8')
    assert.match(text, /actions\/checkout@v7/, name + ' checkout')
    assert.doesNotMatch(text, /actions\/checkout@v[1-6]\b/, name + ' deprecated checkout')
    if (text.includes('actions/setup-node@')) {
      assert.match(text, /actions\/setup-node@v7/, name + ' setup node')
      assert.doesNotMatch(text, /actions\/setup-node@v[1-6]\b/, name + ' deprecated setup node')
    }
  }
})
