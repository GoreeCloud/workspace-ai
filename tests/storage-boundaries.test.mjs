import test from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'

test('local OAuth storage rejects symlinks and exposed credentials without reading target data', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'workspace-ai-secret-safety-'))
  try {
    // The child gets a temporary HOME; it never touches an actual OAuth profile.
    const script = [
      "import assert from 'node:assert/strict'",
      "import {mkdir, writeFile, symlink, unlink, rm, chmod} from 'node:fs/promises'",
      "import path from 'node:path'",
      "import {readProfile, saveProfile} from './server/storage.mjs'",
      "const folder=path.join(process.env.HOME,'.config','workspace-ai')",
      "const profile=path.join(folder,'credentials.json')",
      "const external=path.join(process.env.HOME,'external-secret.json')",
      "await mkdir(folder,{recursive:true,mode:0o700})",
      "await writeFile(external,JSON.stringify({private:'synthetic'}),{mode:0o600})",
      "await symlink(external,profile)",
      "await assert.rejects(()=>readProfile())",
      "await unlink(profile)",
      "await writeFile(profile,JSON.stringify({private:'synthetic'}),{mode:0o600})",
      "await chmod(profile,0o644)",
      "await assert.rejects(()=>readProfile(),/private regular file/)",
      "await chmod(profile,0o600)",
      "assert.deepEqual(await readProfile(),{private:'synthetic'})",
      "await rm(folder,{recursive:true,force:true})",
      "await symlink(path.dirname(external),folder)",
      "await assert.rejects(()=>readProfile(),/directory must be private/)",
      "await assert.rejects(()=>saveProfile({token:'synthetic'}))"
    ].join('\n')
    const child = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
      cwd: process.cwd(), encoding: 'utf8',
      env: {...process.env, HOME: home}, timeout: 15000,
    })
    assert.equal(child.status, 0, child.stderr || child.error?.message)
  } finally {
    await rm(home, {recursive: true, force: true})
  }
})
