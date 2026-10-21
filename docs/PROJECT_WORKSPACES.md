# Project workspaces — capabilities and boundaries

**Implementation status:** Browser-local project workspace MVP. This feature is inspired by the organizational model of ChatGPT Projects but is an independent implementation and does not import ChatGPT project data, memory, uploaded files, or connected apps.

## Available now

- Create up to 100 named projects; choose a glyph from 12 icons.
- Store per-project instructions (up to 4,000 characters) and independently editable or deletable private memory notes (up to 4,000 characters). On a completed assistant message inside a project, use **Review for project memory** to edit an excerpt (up to 1,200 characters), then explicitly approve saving it. A chat source title is retained; automatic extraction and self-learning are not enabled.
- Organize, rename, pin, and move conversations between projects from All Chats. The selected chat's destination project determines the context used on subsequent requests. Removing a chat from a project stops supplying project context.
- Open the [multi-provider project overview](PROJECT_MULTI_PROVIDER.md) to read GitHub repositories and Todoist tasks concurrently through their existing read-only authenticated endpoints, and inspect blocked Gmail → GitHub → Todoist → Drive workflow steps without executing writes.
- Select individual API integration and MCP service access profiles. For selected MCP services, configure independent Read and Write switches, a maximum Low/Medium/High/Critical risk ceiling for each mode, and reviewed individual tools. Every grant is disabled by default. These settings are browser-local preferences, NOT verified execution permissions, and do not enable tool calls. See [MCP Risk Permissions](MCP_RISK_PERMISSIONS.md).
- Import strictly decoded UTF-8 text and source files (.txt, .md, .csv, .json, .yaml, .js, .ts, .py, .html, .css, .xml, .sql and listed variations) using the OS's file picker on a supported browser/device. Search imported file names/contents, preview up to 8,000 characters and download the original imported text snapshot. Up to 10 text files per project, 64 KiB each; files are saved as browser-local text copies. PDF, images, Office documents and arbitrary binary files are **not** supported.
- Link read-only local text files, folders and already-connected Dropbox text files for bounded, periodic re-reading while Projects remains open. Handles stay in browser-local IndexedDB, while snapshot text and source metadata are backed up without the handles. See [Live project sources](PROJECT_LIVE_SOURCES.md).
- Import a read-only UTF-8 text snapshot from an already-connected Dropbox session by providing an existing Dropbox path. The local server uses its server-held token; the browser does not receive the token. The request is origin-gated, restricted to the Dropbox file-content endpoint, rejects redirects and large/binary files and performs no provider mutation. The session must have Dropbox content-read scope. Google Drive import cannot yet work without separate provider OAuth registration; the UI explains this limitation.

## Sharing and effective AI context

Each project has its own memory store. Notes never flow into another project's AI context: there is no cross-project memory sharing or global memory pool. Legacy `shareMemoryWith` settings are discarded when projects load or backups are restored and are ignored even if they appear on unnormalized input. Memory use is opt-in; disabling pauses inclusion in future requests without erasing notes. The user may edit or delete the selected project's notes at any time, including with memory disabled. Deleting all notes requires confirmation and affects future requests, not past conversations or exported backups.

Separately, users can opt into one-way **reference file** sharing to specified destination projects; instructions and memory notes are never shared. File sharing can be revoked and deleting a project removes its file sharing links.

A request in a project includes a bounded text context: its instructions, its own enabled memory notes, question-ranked file excerpts (selected using local keyword matching), and explicitly allowed reference files from other projects (never their memory notes). Relevant file text is selected from near the matching terms and carries a file-name/source-ID label; only bounded excerpts are sent, not complete documents. Long instructions, memory notes, and files can be truncated to fit the request budget. It is included as a **user-role context prefix** in the outgoing request, not as a protected system/developer message. This is guidance to the model, not a security boundary; untrusted imported file content could contain adversarial instructions. Tool execution remains disabled regardless of these notes. A maximum of about 7,000 context characters is used, so long data may be truncated, and this is **not** full-document retrieval, vector search, or automatic memory management.

Requests outside a project do not include any project context. Moving a chat from one project to another changes future context only; already generated chat messages stay in that chat, so old sensitive answers are not removed automatically. Before moving sensitive conversations, consider their existing message history.

## Privacy, retention, portability

Projects, file text, notes and share settings persist in the current browser's localStorage. An AI response request sends the relevant scoped text to the chosen AI provider; no automatic cloud backup or cross-device synchronization occurs. The entire workspace JSON backup includes project configuration and imported text files, which can be sensitive, but excludes integration credentials and OAuth secrets. Restoration validates file extension/size, metadata bounds and project references.

Browser storage limits can prevent saving large amounts of text. The app surfaces a storage error, but localStorage is not a transactional database and a separate backup should be kept. Credentials remain in the separate local server configuration or session memory.

## Remaining acceptance and roadmap

- Real browser/mobile flow verification on a representative laptop and Android handset, including local file picking and source file content.
- Safe incremental project attachment storage in IndexedDB (or encrypted, user-managed disk storage) instead of localStorage, quota notifications, explicit retention controls, and attachment export options.
- Google Drive OAuth configuration with least-privilege file-picker and download flows, plus additional providers and permissions checks.
- PDF/image/Office parsing in a bounded sandbox with malware protections, text extraction and citations.
- Per-entry project-memory revision history and granular deletion auditing; whole-memory deletion is available, but exported backups remain user-managed.
- Per-project server-verified identity, connector scopes, durable audit logging, action-bound execution approvals, and end-to-end provider tests before actual plugin/MCP execution. The owner-key approval broker also supports a separately guarded live execution route, disabled by default; production-quality identity, authorization, audit and real-provider acceptance remain outstanding.
- Strong context isolation, security and prompt-injection tests. The current context is model guidance, not an isolated model sandbox.

No public deployment or production readiness is implied by source changes or passing unit tests.
