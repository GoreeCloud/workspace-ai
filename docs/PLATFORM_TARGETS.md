# Workspace AI — profile and cross-platform targets

**October 21, 2026 · Development source only.** The authoritative application is a React/Vite web UI backed by a localhost-only Express server. These changes do not provision a hosted mobile backend, produce a signed native mobile app, or release Linux/Windows installation binaries.

## Account profile settings

Settings → My profile shows the optional name/username claim returned by the already-verified ChatGPT OAuth sign-in, falling back to the account email or Local guest. It allows the browser user to choose or remove a 160×160 JPEG avatar produced locally from a supported photo. The browser stores the avatar using the existing verified account-scoped storage namespace. The avatar is not uploaded to ChatGPT or the API and does not automatically sync with another device. Browser clearing can permanently erase it. The existing token store remains server-side, never included in the profile API response.

## Mandatory native operating-system applications and services

**Owner directive — October 21, 2026.** Every GoreeCloud application and service distributed for a supported operating system **must be built as a genuine native application or service for that operating system**. This applies to Linux, Windows, Android, iOS, iPadOS, macOS, and all other platforms GoreeCloud declares it supports.

- A platform's deliverable **must not consist only of** a website, Progressive Web App, browser shortcut, WebView, Electron or similar web UI wrapper, or an embedded remote web experience.
- Native applications must have a genuine OS-targeted app implementation and distributable package, appropriate lifecycle and system integrations (such as OS-managed windows, notifications, camera/microphone/files, secure storage, background behavior where supported), accessibility, installation/update/uninstall, and platform-level testing. Platform-native toolkits or frameworks that produce real native applications may share cross-platform code. **Bundling a browser engine around the existing website does not qualify.**
- Service-only products must have an operating-system-native service or daemon implementation with the target platform's service management, security, startup/shutdown, logging and packaging behavior; a web administration interface may be supplemental but not a substitute for the native service.
- Web, PWA, API and browser-based experiences may exist **in addition to**, but cannot be counted as, the required native application/service for a declared OS. Do not mislabel prototype wrappers or temporary installation bridges as completed native deliverables.
- Before declaring a supported OS complete, verify an actual native implementation, architecture and source, build/package authenticity, OS integration, security/privacy, real-device or VM interaction, upgrades and rollback, and any applicable signing/distribution requirements. Unverified or missing native platforms remain explicitly **not complete**.

**Workspace AI compliance:** The existing React web application/PWA and experimental Electron desktop shell are development aids, not fulfillment of the native Linux/Windows/Android/iOS/iPadOS requirements. Native platform applications and system services require distinct implementation and acceptance work. The current browser-first prototype must not be promoted or represented as a native-platform product solely because it can be installed or wrapped.

## Web and mobile

The responsive web UI now has an installable Progressive Web App manifest, 192px/512px PNG icons, Apple home-screen icon, and a limited service worker. The service worker caches only public images, manifest and fingerprinted static assets—not HTML navigations, API replies, OAuth endpoints, chat content, user memories, or account files.

- **Web:** local browser application; a general hosted production deployment requires a separately reviewed authentication and tenancy architecture.
- **Android / iOS:** installable PWA in eligible mobile browsers is a development target. It needs an approved HTTPS backend reachable by that device and strict per-user backend authentication, resource separation and sync. The current backend only listens at 127.0.0.1, meaning a phone cannot access a backend on another computer. No APK, AAB or IPA is provided by this change.
- Installing a PWA does not, by itself, synchronize chats across devices; local-only history remains vulnerable to browser storage loss.

## Linux and Windows desktop development

An experimental `desktop/` Electron host starts the existing Node Express service bound to an ephemeral 127.0.0.1 port. The desktop host requires a startup message from that exact child process, rather than treating an HTTP response on the chosen port as proof of backend identity. Camera/microphone permissions require an explicit local consent dialog, and an unexpected backend exit closes the desktop window. Renderer Node integration is disabled, context isolation and sandbox enabled, and navigation is restricted to the exact local origin. OAuth authorization links may open only through the system browser at `https://auth.openai.com`. Build targets are Linux AppImage/DEB and Windows NSIS/portable. Other navigation is blocked. Desktop packaging depends on the prepared server, built web assets and compatible root node modules.

The repository has an **unsigned desktop qualification workflow** (`.github/workflows/desktop-packages.yml`) to attempt Linux AppImage/DEB and Windows NSIS/portable builds in separate GitHub runners. It creates short-lived, clearly marked **UNSIGNED-QA** artifacts only and never publishes a release. The desktop packaging toolchain currently has no committed desktop-specific lockfile; those dependencies are resolved in isolated CI and must be locked and security-reviewed before release. This workflow is a build qualification gate, not installer trust or signing.

GitHub Actions has produced **unsigned, temporary Linux AppImage/DEB and Windows NSIS/portable QA build artifacts**, but no signed, released or OS-runtime-validated native Linux/Windows application. These Electron packages wrap the web interface and **do not satisfy the native implementation mandate above**. Running Electron packaging uses external dependencies and must occur in a reviewed build environment. The OAuth system browser callback and returning focus to the desktop shell, backend shutdown behavior, Windows native process termination, local file/camera/microphone permissions, upgrades and user data migration need end-to-end platform testing.

## Release gates and rollback

1. Run exact feature-head `npm ci && npm run check`, examine automated browser smoke checks, check workspace account isolation and avatar quota failure behavior; review branch protection before merge.
2. Test web/PWA install and uninstall on supported Android and iOS with an approved, separately hosted multi-user backend. Verify no confidential data remains in cached public assets.
3. Build and validate actual Linux and Windows native desktop applications and platform services, using reproducible locked dependencies and genuine OS-native interactions; the Electron QA wrappers are interim test scaffolding only. Check dependency licenses, package hashes, signed installer verification, OAuth handoff and safe service shutdown.
4. Backups, storage loss warnings, real-device accessibility, security review, staged rollouts and recovery tests are required before release. Source merge and CI do not imply Stable or production installation.

Rollback is an isolated pull-request revert; preserve local browser history, signed-in credential state and the existing localhost installation.
