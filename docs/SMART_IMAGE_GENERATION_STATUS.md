# Smart Image Generation — engineering status

Development branch, **not merged or deployed**.

## Verified design

Ideogram v2 documents direct generation for Ideogram 4.5, GPT Image 2.5 (Flare and Sunburst), and Nano Banana 2.1 through one server-side API integration. Direct REST calls should require an explicit user action; MCP agent execution must remain independently authorized.

## Prepared, not yet integrated

A complete local implementation package contains Smart/Manual routing, REST price-only dry runs and generation, session-memory credentials, image URL checks, a responsive editor, an installer, and nine passing isolated tests. Applying this package to a Workspace AI-compatible fixture passed. Full repository CI, real Ideogram calls, live browser QA and native-app acceptance **have not** been completed.

The authorized developer laptop connection was intermittent during integration; only branch scaffolding has been pushed. Do not merge this branch or present it as a working feature until the reviewed package is applied and verified in the actual repository.

## Next actions

1. Apply the reviewed package on a clean checkout of this feature branch; the installer recognizes the existing minimal policy scaffold.
2. Run npm tests, production build, repository CI and browser/mobile UI checks.
3. Verify an actual Ideogram provider output using an authorized credential, starting with the no-charge dry-run quote.
4. Confirm generated result hostnames, downloads, account-switch revocation, provider pricing, and failure behavior.
5. Keep agent/MCP execution disabled until its broker, explicit grants, cancellation and auditing are validated.
