# Smart Image Generation — development verification

**Status:** Implemented in [draft PR #62](https://github.com/GoreeCloud/workspace-ai/pull/62); **not merged, deployed, or approved as a native OS application**.

## Implemented

- Dedicated **Smart Images** page, Smart (Auto) heuristic model routing, and explicit single-model lock.
- Ideogram REST integration for Ideogram 4.5, GPT Image 2.5 (Flare / Sunburst), and Nano Banana 2.1.
- Separately triggered unbilled `dry_run` pricing lookup and potentially billed generation; no automated fallback or provider retry.
- Session-only provider credential entry (or server environment configuration), cleared on account login, switching or sign-out.
- In-flight credential revision invalidation, image-URL allowlisting, bounded concurrent requests, and suppression of identical simultaneously running paid generations.
- Focused unit tests for routing, provider calls, malformed image hosts, credential changes, and duplicate-charge prevention.

## Verified

- GitHub `test-and-build` CI passed after duplicate-request protection was added (October 21, 2026).
- Earlier isolated runtime verification returned HTTP 200 for provider status, 409 without a credential, and 403 for cross-origin requests.
- All verification to date uses local mocked provider responses or requests without a provider key. **No paid Ideogram generation was performed.**

## Not yet verified or delivered

- Real Ideogram dry-run pricing with an authorized account, live provider generation or final response CDN hostnames.
- Visual screenshot/accessibility acceptance at desktop and mobile viewport sizes, direct image-download persistence, deployment or native operating-system packages.
- Agent-driven image generation. The MCP approval broker must separately authorize any future image tool integration.

This development branch is already integrated and tested; installing an earlier standalone zip is **not** a prerequisite. See [Smart Image Generation](SMART_IMAGE_GENERATION.md) for usage and limitations.
