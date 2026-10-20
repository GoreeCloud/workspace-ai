# Multi-provider project overview and workflow readiness

Workspace AI Projects now provide a **concurrent, user-initiated, read-only** overview for supported standalone connections. This is not a general automation engine or implicit permission to write.

## Supported now

- With the GitHub connection authenticated as **GoreeCloud**, select GitHub under the project's API integration preferences and connect/verify the provider in API integrations. The project overview reads up to 50 repository records through the existing restricted read route, displaying at most ten titles. The server holds the token.
- With Todoist already connected, select Todoist for this project. The overview reads a bounded page of open tasks through the existing read-only Todoist API v1 route, displaying at most ten task titles.
- Clicking **Read selected apps together** issues these two GET requests concurrently, using separate local API routes. Individual errors do not block the other provider's response. Neither provider receives data from the other provider, and the model is not invoked.
- Project provider selection is browser-local preference metadata. The existing read routes independently require an authenticated provider session and enforce upstream restrictions. This is not a server-held per-project authorization system or proof that the app can write to providers.
- A visible planning section shows the intended four-step **Gmail search → GitHub source-file read → Todoist task creation → Google Drive file update** workflow. Listing repository metadata is supported, but reading arbitrary source files is not yet implemented. It explicitly identifies non-executable steps, unselected services and missing connections. No action is invoked from this planning section.
- Selected MCP services are shown as a separate execution authority. This overview does not invoke MCP tools or broaden their read/write risk permissions.

## Unsupported until authorized integration

- Gmail and Google Drive now have an **optional standalone, read-only OAuth connection panel** on the Project page. A separately registered Google Cloud OAuth client and approved scopes are still required. Gmail search and per-file Drive listing/preview are standalone reads only, not automated workflow steps. A ChatGPT connector does not automatically authorize this independent web app.
- Todoist task creation is a write and requires a reviewed server-side write adapter, idempotency, explicit per-operation consent and audit. The currently connected Todoist route is read-only.
- Google Drive updates require an authenticated, narrowly scoped file selector, version/conflict management, identity checks, action review and undo/recovery.
- Cross-provider data forwarding requires a clear source-to-destination data-flow consent, data-minimization rules, user preview and separate approval per write. No automatic forwarding or multi-stage execution exists yet.
- Full workflow automation, real OAuth/provider acceptance, and production deployment remain unverified.

## Tests

Synthetic tests verify that only selected and connected providers are read, that concurrent responses are sanitized to display fields, that failures remain isolated, that no writes occur, and that unsupported steps are marked unavailable. The repository's production build and browser smoke check provide additional but distinct evidence.

See [MCP risk permissions](MCP_RISK_PERMISSIONS.md) and [MCP live execution](MCP_LIVE_EXECUTION.md) for independent MCP security controls.
