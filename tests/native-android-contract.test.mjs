import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const root = new URL('../android-native/',import.meta.url)
const source = readFileSync(new URL('app/src/main/java/com/goreecloud/workspaceai/nativeapp/MainActivity.java',root),'utf8')
const manifest = readFileSync(new URL('app/src/main/AndroidManifest.xml',root),'utf8')
const build = readFileSync(new URL('app/build.gradle.kts',root),'utf8')

test('native Android starter contains no WebView or browser-wrapper APIs',()=>{
  assert.doesNotMatch(source,/import\s+android\.webkit|new\s+WebView\s*\(|\.loadUrl\s*\(/)
  assert.match(source,/extends Activity/)
  assert.match(source,/new EditText\(this\)/)
  assert.match(source,/new AlertDialog\.Builder\(this\)/)
})

test('offline Android starter requests no network or data permissions',()=>{
  assert.doesNotMatch(manifest,/<uses-permission/)
  assert.match(manifest,/android:allowBackup="false"/)
  assert.match(manifest,/android:usesCleartextTraffic="false"/)
  assert.match(manifest,/android:windowSoftInputMode="adjustResize"/)
  assert.match(build,/applicationId = "com\.goreecloud\.workspaceai\.nativeapp"/)
})

test('native preview cannot claim secure AI messaging without backend',()=>{
  assert.match(source,/send\.setEnabled\(false\)/)
  assert.match(source,/Offline developer preview/)
  assert.doesNotMatch(source,/HttpURLConnection|OkHttpClient|ACCESS_TOKEN|API_KEY/)
})
