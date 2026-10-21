import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const file=readFileSync(new URL('../.github/workflows/desktop-packages.yml',import.meta.url),'utf8')
test('desktop CI produces temporary unsigned QA builds on Linux and Windows only',()=>{
 assert.match(file,/ubuntu-latest/)
 assert.match(file,/windows-latest/)
 assert.match(file,/CSC_IDENTITY_AUTO_DISCOVERY: 'false'/)
 assert.match(file,/--publish never|npm run package:/)
 assert.match(file,/UNSIGNED-QA/)
 assert.match(file,/retention-days: 3/)
 assert.doesNotMatch(file,/gh release create|secrets\.|publish: true|deploy-pages|gh-pages/)
})
test('desktop CI uses locked application dependencies and checks source before packaging',()=>{
 assert.match(file,/npm ci/)
 assert.match(file,/npm run check/)
 assert.match(file,/node --check desktop\/main\.cjs/)
 assert.match(file,/if-no-files-found: error/)
})
