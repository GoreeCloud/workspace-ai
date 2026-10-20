# GoreeCloud Workspace AI

A local-first, open-source AI chat workspace with **Sign in with ChatGPT** plan access and an optional, separately billed **OpenAI API** fallback. This is an independent GoreeCloud application, not the official ChatGPT client.

## Features

- Responsive desktop/mobile chat interface, streaming replies, conversation history, Markdown rendering, and export.
- GC UI collapsible sidebar with MCP, API, Projects, Pinned, All Chats, and Settings; compact mode and expanded groups persist locally.
- Project workspaces with independent instructions, glyphs, editable memory notes, opt-in cross-project sharing, text references, integration profiles and movable conversations.
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

## Workspace navigation and integration status

The new sidebar supports project organization, pins, All Chats search, a seven-provider API dashboard, and a three-provider MCP dashboard. Connection badges are based on real server checks, not on whether a service appears in the catalog. Projects can import browser-local text files and read-only Dropbox text snapshots. Google Drive import and ChatGPT Projects import remain unsupported.

Todoist supports **read-only API v1 project/task browsing** after connecting a token; Dropbox, Linear, GitHub (authorized GoreeCloud identity only), and Cloudflare currently support **read-only token verification**. Gmail and Google Drive still require provider OAuth app registration. Remote Desktop Commander, TinyFish, and Firecrawl require authorized administrator-configured MCP endpoints for discovering tool definitions. All tools are shown as **non-executable** pending granular permissions, approval flows, and provider-specific implementations. See [architecture and provider matrix](docs/WORKSPACE_NAVIGATION.md).

Run the optional browser navigation smoke check against a local running server using a locally installed Chromium binary:

```bash
CHROMIUM_EXECUTABLE=/path/to/chromium npm run browser:smoke
```

Override the target with `WORKSPACE_AI_BASE_URL=http://127.0.0.1:3031` if needed. The smoke test uses a temporary browser profile and synthetic local project data, and covers desktop/sidebar/mobile navigation. It should be run against an isolated local test server rather than an active personal session.

## Project workspaces

Open **Projects** to create a project, select its glyph, set custom instructions, edit memory notes, and manage project files and chats. Completed assistant messages in a project offer **Review for project memory**: edit the suggested excerpt and explicitly save it; nothing is memorized automatically. Project files can be searched, previewed and downloaded locally. Project-to-project sharing is disabled until you opt into one-way sharing of notes or reference files. Chat movement changes project context for future messages, without rewriting prior responses.

Supported local imports are UTF-8 text and source files selected from your device's file picker, up to 10 files of 64 KiB per project. An already-connected Dropbox session with file-content read permission can provide a read-only text snapshot via the project browser or path field. Google Drive OAuth, binary files, PDF/image parsing, cloud synchronization and automatic memory are not yet implemented. Project API/MCP selections are configuration preferences only; executable tools are still disabled. Each selected MCP provider now has independent Read and Write switches, four maximum-risk levels (Low, Medium, High, Critical), and per-tool allowlisting. New grants are disabled by default. See [MCP risk permissions](docs/MCP_RISK_PERMISSIONS.md). A bounded, question-ranked project context with labeled file excerpts is sent to the selected AI provider during relevant chat requests. This is not semantic search or a trust boundary; source text can be truncated.

See [Project workspaces: capabilities and boundaries](docs/PROJECT_WORKSPACES.md) for the security model, limitations, remaining work and privacy/backup implications. An optional [local MCP approval broker](docs/MCP_APPROVAL_BROKER.md) can validate time-limited server-side project grants and single-use approvals in dry-run mode; real MCP execution remains disabled.

## Browser-local backup and shortcuts

Open **Settings & connections → Privacy** to download a JSON backup or choose an existing Workspace AI JSON backup for restore. Imported archives are validated before changes. **Merge** preserves existing conversations when their IDs conflict; **Replace** asks for confirmation and replaces the browser-local conversations, projects, and pins. An import respects the application's 50-conversation limit; the UI reports conversations skipped during a merge. If browser storage is full, restoration reports an error and attempts to roll back both local storage keys.

The archive includes conversation content (possibly sensitive), project metadata, and pins. It does **not** include ChatGPT OAuth credentials, API keys, service tokens, provider session state, or server-side settings. Keep backup files in private storage. Import applies only to the browser/profile where you open Workspace AI; it does not synchronize devices or import ChatGPT cloud data.

In **All Chats**, use the pencil action to rename a conversation. **Ctrl/Cmd+K** opens and focuses chat search, and **Ctrl/Cmd+Shift+N** opens a new conversation, unless a modal is open. Shortcuts do not trigger model inference.

## UI foundation and appearance

Workspace AI uses **GoreeCloud UI (GC UI)**, the platform-wide design authority maintained in [GoreeCloud/gc-ui](https://github.com/GoreeCloud/gc-ui). Its Canvas/Surface/Lens hierarchy, Iris semantic colors, original shape/spacing tokens, focus indicators, and reduced-motion fallbacks inform this interface. No Glaze or Glaze UI source is used.

The included `src/gc-ui-tokens.css` is a pinned snapshot of the first-party GC UI alpha token stylesheet, distributed under its own Apache-2.0 license at `licenses/GC-UI-APACHE-2.0.txt`. GC UI's component registry remains experimental; this repo does not claim a stable React component package.

Settings separates **Connections**, **Models & billing**, **Appearance**, and **Privacy** into accessible navigation sections instead of one long obscured form. The Appearance section provides **System**, **Light**, and **Dark** modes. The selected theme is stored in this browser and works without an external theme service. Dialog focus is contained while open and returned to the previous control after closing. Visual/accessibility testing on actual devices remains a release gate.

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
