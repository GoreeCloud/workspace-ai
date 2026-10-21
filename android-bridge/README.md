# GoreeCloud Workspace AI — Android USB Development Bridge

**Status:** QA-only bridge. This is **not** a standalone Android AI app or production release.

The existing Workspace AI server and APIs require Node.js on a host that binds only to `127.0.0.1:3031`. This Android build uses a WebView connected through Android Debug Bridge's reverse port forwarding. The app does not embed or publish API keys, grant remote access, or expose the laptop server to the LAN or Internet.

## Build

Requirements: Android SDK platform 36, Android Gradle Plugin 9.3.0, Gradle 9.5+, JDK 17+, and a separately protected persistent Development signing key.

```sh
cd android-bridge
gradle :app:assembleRelease
```

For update-compatible development distribution, place the Development signing properties at `~/.config/goreecloud/signing/workspace-ai-development.properties` with `storeFile`, `storePassword`, `keyAlias` and `keyPassword`. Never commit keys or signing property files. Increment `versionCode` every new owner-facing APK.

## Use with a USB-connected Android device

```sh
# Laptop
cd /path/to/workspace-ai
npm ci
npm run check
npm start

# Second laptop terminal, with USB debugging authorized:
adb reverse tcp:3031 tcp:3031
adb install -r app-release.apk
```

If the USB connection disappears, start the bridge again. Native-browser ChatGPT OAuth is **not** validated in this WebView, so successful plan sign-in is not guaranteed. The UI, models, integration checks, and API-backed chat depend on the local Node server. This package is for UI and connection QA until a secure, self-contained Android backend/client architecture is implemented. Do not expose port 3031 over an unauthenticated public endpoint.
