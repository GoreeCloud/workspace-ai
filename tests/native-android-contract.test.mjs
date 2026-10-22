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

test('native light theme requests readable Android system bar icons',()=>{
  assert.match(source,/View\.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR/)
  assert.match(source,/View\.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR/)
  assert.ok(source.indexOf('setContentView(root)') < source.indexOf('getWindow().getDecorView().setSystemUiVisibility'), 'system-bar appearance requires a ready decor view')
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

test('native tab changes dismiss the message keyboard and expose selected state',()=>{
  assert.match(source,/selected != 0 && draft != null && draft\.hasFocus\(\)/)
  assert.match(source,/hideSoftInputFromWindow\(draft\.getWindowToken\(\), 0\)/)
  assert.match(source,/draft\.clearFocus\(\)/)
  assert.match(source,/tabs\[i\]\.setStateDescription\(active \? "Selected" : "Not selected"\)/)
})

test('navigation exposes native pane titles and semantic section headings',()=>{
  assert.match(source,/content\.setAccessibilityPaneTitle\(/)
  assert.match(source,/heading\.setAccessibilityHeading\(true\)/)
  assert.match(source,/sectionHeading\("Make room for what’s next\."/)
  assert.match(source,/sectionHeading\("Projects", 30\)/)
  assert.match(source,/sectionHeading\("Settings", 30\)/)
})

test('screenshot-led native review guards centered nav and non-sending starter links',()=>{
  assert.match(source,/name\.setGravity\(Gravity\.CENTER\)/)
  assert.match(source,/ViewGroup\.LayoutParams\.WRAP_CONTENT, ViewGroup\.LayoutParams\.WRAP_CONTENT/)
  assert.match(source,/tabs\[i\]\.setBackground\(navSurface\(active \? PALE : SURFACE\)\)/)
  assert.match(source,/card\.addView\(new IconView\(5, BRAND\)/)
  assert.match(source,/Starter prompts navigate into the draft; they do not send it/)
})

test('native Chat Projects Settings are individually focusable accessibility targets',()=>{
  assert.match(source,/tab\.setContentDescription\(titles\[i\] \+ " tab"\)/)
  assert.match(source,/tab\.setFocusable\(true\)/)
  assert.match(source,/tab\.setImportantForAccessibility\(View\.IMPORTANT_FOR_ACCESSIBILITY_YES\)/)
})

test('settings and appearance use distinct native symbols',()=>{
  assert.match(source,/Settings should be a cog, distinct from Appearance's sun/)
  assert.match(source,/page\.addView\(infoRow\("Appearance", "Light theme", 6\)\)/)
  assert.match(source,/gear\.close\(\)/)
})

test('settings icons correctly distinguish connection security, privacy and appearance',()=>{
  assert.match(source,/infoRow\("Connection", "Offline developer preview", 7\)/)
  assert.match(source,/infoRow\("Privacy", "Drafts remain in this app session", 8\)/)
  assert.match(source,/infoRow\("Appearance", "Light theme", 6\)/)
  assert.match(source,/Connection security: a distinct padlock/)
  assert.match(source,/Privacy: shield, not a conversation icon/)
  assert.match(source,/shield\.close\(\)/)
})
