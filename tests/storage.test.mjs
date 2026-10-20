import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

test('concurrent profile updates retain all changes and stable host identity', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'goreecloud-workspace-profile-'))
  try {
    // Child HOME isolates the test from actual OAuth credentials.
    const script = [
      "import { getHostId, readProfile, updateProfile } from './server/storage.mjs'",
      "import os from 'node:os'",
      "if (os.homedir() !== process.env.HOME) throw Error('Not isolated')",
      "const hosts = await Promise.all(Array.from({length:8}, () => getHostId()))",
      "if (!hosts.every(id => id === hosts[0])) throw Error('Host ID changed')",
      "await Promise.all(Array.from({length:40}, () => updateProfile(profile => ({...profile, count:(profile.count || 0) + 1}))))",
      "const result = await readProfile()",
      "if (result.count !== 40 || result.host_id !== hosts[0]) throw Error('Lost profile update')",
      "try { await updateProfile(() => { throw Error('Synthetic failed update') }); throw Error('Expected rejection') }",
      "catch (error) { if (error.message !== 'Synthetic failed update') throw error }",
      "await updateProfile(profile => ({...profile, afterFailure:true}))",
      "if (!(await readProfile()).afterFailure) throw Error('Queue stalled after failure')"
    ].join('\n')
    const child = spawnSync(process.execPath, ['--input-type=module','--eval',script], {
      cwd: process.cwd(), env: {...process.env, HOME:home},
      encoding:'utf8', timeout:15000
    })
    assert.equal(child.status, 0, child.stderr || child.stdout || child.error?.message)
  } finally {
    await rm(home, {recursive:true, force:true})
  }
})
