# GoreeCloud Workspace AI — Native Android starter

**Status: standalone native, offline developer preview. NOT an AI client or Stable release.**

This is an isolated Android Views / Java starter, **not** a WebView, PWA or website wrapper. It is intentionally separate from `GoreeCloud/workspace-ai`'s browser development app and from the historic USB/WebView QA bridge.

The current prototype uses native text, navigation buttons, modal dialogs, an Android multi-line input editor and keyboard/system-bar insets. **Send is disabled** because no authenticated backend, token isolation, OAuth or provider egress has been implemented. Unsent drafts and the current tab are retained **in memory across configuration changes** such as theme and rotation, without writing to app storage or an Android saved-state Bundle. A process stop, system process reclamation, or new session discards them; nothing is sent.

## Security boundaries

- No `INTERNET`, files, contacts, external storage or account permissions.
- No embedded credentials, test CA, secret keys, network endpoints, token caches or WebViews.
- `android:allowBackup=false` and cleartext traffic disabled.
- Distinct package `com.goreecloud.workspaceai.nativeapp` to avoid modifying the older development bridge.
- Debug builds use transient toolchain-generated signing. Do **not** distribute as a production APK. Signed owner-facing releases need protected persistent signing and an independently verified update/rollback path.

## Build and local QA

```sh
cd android-native
./gradlew :app:assembleDebug
# Artifact: app/build/outputs/apk/debug/app-debug.apk
```

Build and static security contracts are run on pull requests using a native Android CI workflow. An actual Android 16 install, keyboard/rotation/accessibility inspection, lifecycle recovery, multi-account isolation, and secure remote AI connectivity are **still required** before release. Neither the UI nor the original WebView bridge fulfills those release acceptance gates.

## Next milestones

Implement Android-native state architecture, secure per-account storage and accessibility semantics; design a consented owner-authenticated HTTPS backend contract with NetBird and verified TLS; add native authentication, scoped projects, messaging and migration acceptance. Track in [Issue #68](https://github.com/GoreeCloud/workspace-ai/issues/68). Live private ingress remains tracked in [Issue #67](https://github.com/GoreeCloud/workspace-ai/issues/67).
