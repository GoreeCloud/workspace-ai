# Workspace AI cross-feature integration candidate

**Status:** Isolated development/QA candidate, not merged, deployed, or a native operating-system release.

## Sources combined

- PR #61: Documents (text, CSV, Markdown, JSON, DOCX, PDF, XLSX, PPTX targeted operations) and Engineering work-order and four-agent planning foundation.
- PR #62: Smart Image Generation with Ideogram REST, auto/manual model routing, credential isolation and explicitly user-initiated generation.
- PR #63: safe same-origin JSON control transport and readable mobile connection state.
- PR #57: tool-activity event presentation, without claiming agent-initiated tools are available.
- PR #59: layered caching and accurately attributed provider-reported cached token counts.

## Merge integration resolutions

- Preserved all three added sidebar destinations and their corresponding view imports.
- Registered both the Documents conversion routes and Smart Image Generation routes with local-origin checks.
- Retained both credential invalidation for Smart Images and account-scoped model-catalog cache clearing on auth changes.
- Rendered tool-event activity and provider cache counts simultaneously in assistant messages.
- Preserved account scope isolation and fixed a timing-dependent GitHub source test to await actual request start instead of sleeping.

## Verified local evidence

- `WORKSPACE_DOCUMENT_PYTHON=<local-venv>/bin/python npm run check`: **262 Node tests passed**, Vite production frontend built.
- Running isolated loopback server: status 200; image generation without configured provider key 409; unauthorized cross-origin price quote 403.
- Real HTTP document worker create/reopen checks succeeded for DOCX, XLSX, PPTX and PDF using installed Python dependencies.
- Combined Chromium CI now includes Documents, Engineering, Smart Images, integration UI, and mobile connection status assertions (GitHub CI pending).

## Remaining acceptance gates

- GitHub's complete integration CI and Chromium job; representative desktop/mobile screenshots and accessibility walkthrough.
- Actual authorized Ideogram no-charge dry-run, provider media-host compatibility and image save flow; paid inference only after deliberate owner action.
- Native platform implementations for all declared targets. Web builds, PWA or Electron shells do not count as native OS acceptance.
- Device-based/VM install/runtime checks, Office document fidelity checks, and proven agent tool execution before production release.

This branch combines feature work **for testing only**. Leave existing feature PRs as separate drafts until owner-authorized release promotion.
