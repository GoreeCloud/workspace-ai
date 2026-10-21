# GoreeCloud Workspace AI

A local-first, open-source AI chat workspace with **Sign in with ChatGPT** plan access and an optional, separately billed **OpenAI API** fallback. This is an independent GoreeCloud application, not the official ChatGPT client.

## Features

- Responsive desktop/mobile chat interface, streaming replies, conversation history, Markdown rendering, and export.
- GC UI collapsible sidebar with MCP, API, Projects, Pinned, All Chats, and Settings; compact mode and expanded groups persist locally.
- Project workspaces with independent instructions, glyphs, editable project-isolated memory notes, optional reference-file sharing, text references, integration profiles and movable conversations.
- Versioned JSON backup and validated restore for conversations, projects, and pins; supports merge or explicit replacement, with credential-free archives and storage-failure rollback attempts.
- Keyboard shortcuts: **Ctrl/Cmd+K** to focus All Chats search and **Ctrl/Cmd+Shift+N** to start a new conversation.
- Ten-service integration catalog with optional token verification and administrator-configured MCP tool discovery. Connected Todoist sessions can browse projects and tasks through the current Todoist API v1 without writing or modifying data. **External tool execution is disabled**; this does not inherit ChatGPT-connected apps.
- ChatGPT open-source OAuth registration with PKCE, ID-token validation against OpenAI's JWKS, and explicit `chatgpt.tokens.use.direct` permission checks.
- Eligible per-account model selection via OpenAI's model catalog.
- Plan-only, API-only, and automatic plan-first routing, with API fallback **off by default**.
- Server-side session-only or private environment API credentials and protected local OAuth tokens; no credentials are written to browser storage.
- Browser-local chat history. Responses requests use `store: false` and `stream: true`.

## Run locally

Requires Node.js 20+.

```bash
git clone https://github.com/GoreeCloud/workspace-ai.git
cd workspace-ai
npm ci
npm run check
npm start
```

Open **http://127.0.0.1:3031**. `npm run check` builds the frontend and runs the test suite; `npm start` serves both the built frontend and API on loopback only.

For development with Vite hot reload, run `npm run dev` and open **http://127.0.0.1:5173**. After the OAuth callback, the default redirect uses the built app at port 3031.

To connect a ChatGPT subscription, open **Settings & connections** and choose **Continue with ChatGPT**. An eligible plan and the user's approval are required; sign-in alone does not authorize plan usage.

For optional API access, open **Settings & connections → OpenAI API**, paste your key into the password field, and select **Use API key**. Workspace AI performs an automatic **GET /v1/models** authorization check (not a paid inference call); **Verify connection** lets you retry. A successful check proves that OpenAI accepts the key for listing models, **not** that the account has available credits, inference permissions, or access to a specific model. The result distinguishes rejected, restricted, and temporarily unavailable checks. This key stays in the local server's memory only, is not returned to the browser, and must be entered again after a server restart. For persistent configuration instead copy `.env.example` to `.env`, set `OPENAI_API_KEY`, and restart. In Settings choose API-only or opt into automatic fallback. API usage is billed separately and is **not** included with ordinary ChatGPT Plus.

## Account profiles and platform installations

**My profile** in Settings displays the verified account display name or email, with optional locally chosen profile pictures. Pictures are browser-only and scoped to the selected Workspace AI account; they do not upload to ChatGPT or automatically sync. The new **Apps & devices** category provides installation guidance and the current backend limitations.

Workspace AI's source includes a Progressive Web App manifest and public-assets-only service worker for supported desktop and mobile browsers. This is a development install option, not a hosted cross-device service: the bundled server still binds to `127.0.0.1` and requires a separate secure authenticated deployment before another phone can reach it.

**Mandatory native-platform policy (owner directive, October 21, 2026):** Every GoreeCloud application and service must have a real native implementation for each operating system it supports, including Linux, Windows, Android, iOS, iPadOS and other declared platforms. A browser app, PWA, WebView, or Electron-style wrapper alone **does not meet the native-app requirement**. Shared code and supplementary web interfaces are permitted, but do not replace true native frontends or OS-managed services.

`desktop/` currently contains an experimental Electron host and unsigned Linux AppImage/DEB and Windows NSIS/portable **QA packaging**. These wrappers are not native implementation completion. The Android/iOS PWA likewise does not satisfy the native mobile requirement. **No completed, signed or device-validated native platform release is available from these builds.** See [native-platform criteria and release gates](docs/PLATFORM_TARGETS.md).

## Workspace navigation and integration status

The sidebar supports Projects, **Prompts** (a searchable browser-local reusable prompt library for chats and Project-scoped drafts), pins, All Chats search, a seven-provider API dashboard, and a two-provider MCP dashboard. See [Saved Prompts](docs/SAVED_PROMPTS.md). Connection badges are based on real server checks, not on whether a service appears in the catalog. Projects can import browser-local text files and read-only Dropbox text snapshots. The project editor also supports multiple independent MCP account *profiles* per provider, per-account tool and resource scopes, and separately editable/exportable private memories; profile labels and scopes are not authenticated connections or executable access grants. Google Drive import and ChatGPT Projects import remain unsupported.

Todoist supports **read-only API v1 project/task browsing** after connecting a token; Dropbox, Linear, GitHub (authorized GoreeCloud identity only), and Cloudflare currently support **read-only token verification**. Gmail and Google Drive still require provider OAuth app registration. Remote Desktop Commander and Firecrawl require authorized administrator-configured MCP endpoints for discovering tool definitions. All tools are shown as **non-executable** pending granular permissions, approval flows, and provider-specific implementations. See [architecture and provider matrix](docs/WORKSPACE_NAVIGATION.md).

Run the optional browser navigation smoke check against a local running server using a locally installed Chromium binary:

```bash
CHROMIUM_EXECUTABLE=/path/to/chromium npm run browser:smoke
```

Override the target with `WORKSPACE_AI_BASE_URL=http://127.0.0.1:3031` if needed. The smoke test uses a temporary browser profile and synthetic local project data, and covers desktop/sidebar/mobile navigation. It should be run against an isolated local test server rather than an active personal session.

## Project workspaces

Open **Projects** to create a project, select its glyph, set custom instructions, edit memory notes, and manage project files and chats. Completed assistant messages in a project offer **Review for project memory**: edit the suggested excerpt and explicitly save it; nothing is memorized automatically. Project files can be searched, previewed and downloaded locally. Memory never crosses project boundaries, even if an older workspace backup contains memory-sharing grants. Notes can be edited or deleted in their own project at any time, including while memory is disabled. Optional one-way sharing applies to reference files only. Moving or removing a conversation from a project starts a new AI history segment: previous messages remain visible but are not sent in future requests, and cannot be saved through the new project's memory-review controls. Each move boundary survives backup and restore. Existing old conversations without historical move markers cannot be fully reconstructed. Workspace and chat writes detect stale browser tabs before writing; on conflict the stale tab becomes read-only until reloaded. New conversations stop at the 50-chat local storage limit rather than silently discarding older chats. Browser localStorage is not an atomic multi-key database, so keep separate backups.

Supported local imports are UTF-8 text and source files selected from your device's file picker, up to 10 files of 64 KiB per project. An already-connected Dropbox session with file-content read permission can provide a read-only text snapshot via the project browser or path field. **Live linked local files and directories** and **linked Dropbox text files and folders** can now refresh while the Projects page is open, with a 60-second scan interval; see [Linked sources](docs/PROJECT_LIVE_SOURCES.md). Standalone Google Drive OAuth read-only support and linked **already-authorized** Drive text files are available in source, but require a separate registered Google Cloud OAuth client. See [Drive file links](docs/PROJECT_DRIVE_LIVE_FILES.md). Google Picker, arbitrary existing Drive files, Drive directories, binary files, PDF/image parsing, and automatic memory are not implemented. Project API/MCP selections are configuration preferences only; executable tools are still disabled. Each selected MCP provider now has independent Read and Write switches, four maximum-risk levels (Low, Medium, High, Critical), and per-tool allowlisting. New grants are disabled by default. See [MCP risk permissions](docs/MCP_RISK_PERMISSIONS.md). Projects can also read from selected and connected GitHub and Todoist accounts together without cross-provider data forwarding. An explicit [GitHub source-file preview](docs/PROJECT_GITHUB_SOURCE.md) reads bounded UTF-8 content from a GoreeCloud-owned repository. Standalone, opt-in read-only Gmail and Drive OAuth adapters are implemented, while real OAuth configuration and acceptance remain outstanding; cross-provider writes remain blocked. See [Multi-provider project overview](docs/PROJECT_MULTI_PROVIDER.md). A bounded, question-ranked project context with labeled file excerpts is sent to the selected AI provider during relevant chat requests. This is not semantic search or a trust boundary; source text can be truncated.

See [Project workspaces: capabilities and boundaries](docs/PROJECT_WORKSPACES.md) for the security model, limitations, remaining work and privacy/backup implications. An optional [local MCP approval broker](docs/MCP_APPROVAL_BROKER.md) validates short-lived policies and single-use approvals. A separately guarded [MCP live execution route](docs/MCP_LIVE_EXECUTION.md) is present but **disabled by default** and requires additional operator and provider configuration, reviewed tool adapters, and action approvals.

## AI Agents (Agent Studio)

Open **Agents** to create project-specific agents, configure instructions and roles, and run up to four agents concurrently. A coordinator agent in the same project can optionally synthesize results. Agent runs use the existing chat inference endpoint with only the selected project's enabled context and no tool invocation; API usage may be billed separately. Agent definitions are included in local backups. Agents cannot access memory from another project.

**Optional scheduled agents:** A local server can enable owner-key protected schedules with WORKSPACE_AI_ENABLE_SCHEDULED_AGENTS=true, WORKSPACE_AI_AGENT_OWNER_KEY (32+ random characters), and a separately configured environment OPENAI_API_KEY. Scheduling is off by default, at most eight runs occur within 24 hours, and unattended runs have no tools or browser memory. Jobs keep independent snapshots and must be removed separately if a project is deleted. See [Agent Studio design, security and limitations](docs/AGENT_STUDIO.md).

## Account sync (opt-in development)

Sign-in alone does not synchronize browser data. Local-only projects and memories can be lost when device storage is cleared. An encrypted, account-verified shared-gateway sync pathway is present in source, but requires a separately deployed HTTPS gateway and a user-held recovery passphrase. No production sync service is currently configured or claimed. Seven additional optional MCP catalog entries support discovery only, not tool execution. See [Account sync](docs/ACCOUNT_SYNC.md).

## Browser-local backup and shortcuts

Open **Settings & connections → Privacy** to download a JSON backup or choose an existing Workspace AI JSON backup for restore. Imported archives are validated before changes. **Merge** preserves existing conversations when their IDs conflict; **Replace** asks for confirmation and replaces the browser-local conversations, projects, and pins. An import respects the application's 50-conversation limit; the UI reports conversations skipped during a merge. If browser storage is full, restoration reports an error and attempts to roll back both local storage keys.

The archive includes conversation content (possibly sensitive), project metadata, and pins. It does **not** include ChatGPT OAuth credentials, API keys, service tokens, provider session state, or server-side settings. Keep backup files in private storage. Import applies only to the browser/profile where you open Workspace AI; it does not synchronize devices or import ChatGPT cloud data.

In **All Chats**, use the pencil action to rename a conversation. **Ctrl/Cmd+K** opens and focuses chat search, and **Ctrl/Cmd+Shift+N** opens a new conversation, unless a modal is open. Shortcuts do not trigger model inference.

## UI foundation and appearance

Workspace AI uses **GoreeCloud UI (GC UI)**, the platform-wide design authority maintained in [GoreeCloud/gc-ui](https://github.com/GoreeCloud/gc-ui). Its Canvas/Surface/Lens hierarchy, Iris semantic colors, original shape/spacing tokens, focus indicators, and reduced-motion fallbacks inform this interface. No Glaze or Glaze UI source is used.

The included `src/gc-ui-tokens.css` is a pinned snapshot of the first-party GC UI alpha token stylesheet, distributed under its own Apache-2.0 license at `licenses/GC-UI-APACHE-2.0.txt`. GC UI's component registry remains experimental; this repo does not claim a stable React component package.

Settings separates **My profile**, **Connections**, **Models & billing**, **Appearance**, **Privacy**, and **Apps & devices** into accessible navigation sections instead of one long obscured form. The Appearance section provides **System**, **Light**, and **Dark** modes. The selected theme is stored in this browser and works without an external theme service. Dialog focus is contained while open and returned to the previous control after closing. Visual/accessibility testing on actual devices remains a release gate.

## Security and scope

- The backend binds only to `127.0.0.1`. It is not a multi-user hosted service. Do not expose it to the public Internet or place it behind an unauthenticated reverse proxy.
- OAuth credentials live in `~/.config/workspace-ai/credentials.json` with owner-only permissions. API credentials can be provided through a private local environment or temporary server memory; integration tokens are held only in server memory. None are committed to GitHub.
- History is stored in the browser's local storage until removed or site data is cleared. The app does not import ChatGPT chats, Projects, custom GPTs, memory, plugins, or tools.
- Usage limits, model availability, eligibility, and revocation are managed by OpenAI. Review access in ChatGPT settings.
- Successful sign-in, live model inference, and paid API billing require actual authorization/credentials; automated tests do not prove these flows.
- The app is a development build, not a production-ready public deployment. Browser-level accessibility and live OAuth tests remain acceptance tasks.

## References

- [Open-source Sign in with ChatGPT](https://developers.openai.com/siwc/token-sharing-open-source)
- [OpenAI sign-in registration](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
- [Models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)
- [Sign in with ChatGPT Terms](https://openai.com/policies/sign-in-with-chatgpt-terms/)

## License

AGPL-3.0-or-later — see [LICENSE](LICENSE). Copyright (c) 2026 GoreeCloud.

Google Workspace integrations can be optionally connected through [standalone read-only OAuth](docs/GOOGLE_OAUTH_READ_ONLY.md) when configured on the local server. This does not use ChatGPT connectors and does not enable automated cross-provider writes.
