import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
assert.equal(typeof spawnSync, 'function')
