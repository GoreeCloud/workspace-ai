# Workspace AI — GC UI Native Android Color Adapter (Development)

**Status:** Development-only, incomplete GC UI consumer integration. This document does not certify design-system conformance, Android production support, or owner approval.

## Authority and provenance

- Design authority: [GoreeCloud UI](https://github.com/GoreeCloud/gc-ui), the fifth Integral Platform System.
- Canonical v1 token source: `GoreeCloud/gc-ui/tokens/gc.v1.tokens.json`, inspected at commit `b83213cf26627b60f26cd1416405152bbb1d4fcb`.
- The GC UI Foundations 1.0.1 stable release has a **narrow support scope**. The broader native platform adapters and complete component catalog are experimental/alpha.
- Android implementation: `GcUiNativePalette.java` maps **selected semantic color roles** for this offline preview, without importing experimental Android dependencies or claiming full migration.

## Color role mapping

| GC UI semantic role | Light | Dark | Android consumption |
| --- | --- | --- | --- |
| `canvas` | `#ECF0F8` | `#10131E` | Root surface and system bars |
| `surfaceRaised` | `#FFFFFF` | `#252B3D` | Header and cards |
| `onSurface` | `#20243A` | `#F2F2FA` | Primary text |
| `onSurfaceMuted` | `#5F657B` | `#B3B9CF` | Secondary text and hints |
| `primary` | `#5145D9` | `#C5BFFF` | Active controls and accents |
| `selection` | `#E8E6FF` | `#39316B` | Selected tab backing |
| `divider` | `#E5E7F0` | `#373C50` | Subtle boundaries |

The welcome gradient and disabled-button fills are **preview-specific derived usages**, not supported standalone GC UI tokens. They require visual and foreground-contrast inspection and should eventually be replaced by versioned component usages. Other semantic roles (error, warning, focus, high contrast, motion, advanced components) remain unimplemented.

## Native appearance behavior

The app reads Android `Configuration.UI_MODE_NIGHT_MASK` at Activity startup. Android `values/` and `values-night/` styles select light/dark base native themes; palette values drive the actual Activity Views. The status-bar icon treatment changes with the system appearance, and the Settings screen reports which appearance it followed. There is **no user override** or connected preference yet.

The preview continues to declare no Internet, account, storage, or other Android permissions and cannot send messages or import any user's browser data.

## Verification gates

- [x] Source contract tests validate the pinned semantic colors, native theme resources, privacy boundaries and appearance state.
- [ ] Android Gradle APK build succeeds on this exact source head.
- [ ] Emulator visual QA captures and validates both light and dark **Chat and Settings** screens, with UIAutomator detecting the correct appearance label.
- [ ] Human screenshot review checks legibility, native system bars, touch targets, theme contrast, and keyboard handling in both appearances.
- [ ] Physical-device acceptance with owner-approved UI and secure update signing.
- [ ] Complete GC UI component/token integration, focus indicators, large text, TalkBack, high contrast and migration evidence.

Do **not** promote this experiment, merge it, claim Stable release, or declare GC UI migration complete from token matching alone. The production VPS, shared Caddy proxy and personal Android installations are out of scope.
