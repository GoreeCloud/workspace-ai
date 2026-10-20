# Project workspaces — capabilities and boundaries

**Implementation status:** Browser-local project workspace MVP. This feature is inspired by the organizational model of ChatGPT Projects but is an independent implementation and does not import ChatGPT project data, memory, uploaded files, or connected apps.

## Available now

- Create up to 100 named projects; choose a glyph from 12 icons.
- Store per-project instructions (up to 4,000 characters) and user-edited memory notes (up to 4,000 characters). On a completed assistant message inside a project, use **Review for project memory** to edit an excerpt (up to 1,200 characters), then explicitly approve saving it. A chat source title is retained; automatic extraction and self-learning are not enabled.
- Organize, rename, pin, and move conversations between projects from All Chats. The selected chat's destination project determines the context used on subsequent requests. Removing a chat from a project stops supplying project context.
- Select individual API integration and MCP service access profiles for each project. The selection is local metadata only. No tool is executed by selecting it; credential authentication, permissions and tool execution remain governed by the integration security roadmap.
- Import strictly decoded UTF-8 text and source files (.txt, .md, .csv, .json, .yaml, .js, .ts, .py, .html, .css, .xml, .sql and listed variations) using the OS's file picker on a supported browser/device. Search imported file names/contents, preview up to 8,000 characters and download the original imported text snapshot. Up to 10 text files per project, 64 KiB each; files are saved as browser-local text copies. PDF, images, Office documents and arbitrary binary files are **not** supported.
- Import a read-only UTF-8 text snapshot from an already-connected Dropbox session by providing an existing Dropbox path. The local server uses its server-held token; the browser does not receive the token. The request is origin-gated, restricted to the Dropbox file-content endpoint, rejects redirects and large/binary files and performs no provider mutation. The session must have Dropbox content-read scope. Google Drive import cannot yet work without separate provider OAuth registration; the UI explains this limitation.

## Sharing and effective AI context

Each project starts isolated. The project owner may enable **share my memory notes with** and/or **share my reference files with** individual destination projects. This is **one-way sharing**. Instructions themselves are not inherited or shared. In the destination project's subsequent AI requests, the explicitly allowed source notes or source file contents may be included as reference context; the source project must grant consent. Sharing can be revoked. Deleting a project clears its outgoing and inbound share links.

A request in a project includes a bounded text context: its instructions, memory notes, question-ranked file excerpts (selected using local keyword matching), and data shared to it from other projects. Relevant file text is selected from near the matching terms and carries a file-name/source-ID label; only bounded excerpts are sent, not complete documents. Long instructions, memory notes, and files can be truncated to fit the request budget. It is included as a **user-role context prefix** in the outgoing request, not as a protected system/developer message. This is guidance to the model, not a security boundary; untrusted imported file content could contain adversarial instructions. Tool execution remains disabled regardless of these notes. A maximum of about 7,000 context characters is used, so long data may be truncated, and this is **not** full-document retrieval, vector search, or automatic memory management.

Requests outside a project do not include any project context. Moving a chat from one project to another changes future context only; already generated chat messages stay in that chat, so old sensitive answers are not removed automatically. Before moving sensitive conversations, consider their existing message history.

## Privacy, retention, portability

Projects, file text, notes and share settings persist in the current browser's localStorage. An AI response request sends the relevant scoped text to the chosen AI provider; no automatic cloud backup or cross-device synchronization occurs. The entire workspace JSON backup includes project configuration and imported text files, which can be sensitive, but excludes integration credentials and OAuth secrets. Restoration validates file extension/size, metadata bounds and project references.

Browser storage limits can prevent saving large amounts of text. The app surfaces a storage error, but localStorage is not a transactional database and a separate backup should be kept. Credentials remain in the separate local server configuration or session memory.

## Remaining acceptance and roadmap

- Real browser/mobile flow verification on a representative laptop and Android handset, including local file picking and source file content.
- Safe incremental project attachment storage in IndexedDB (or encrypted, user-managed disk storage) instead of localStorage, quota notifications, explicit retention controls, and attachment export options.
- Google Drive OAuth configuration with least-privilege file-picker and download flows, plus additional providers and permissions checks.
- PDF/image/Office parsing in a bounded sandbox with malware protections, text extraction and citations.
- Project memory extraction/review workflows with approval, version history, and deletion semantics.
- Per-project, policy-enforced connector scopes, audit logging, execution approvals and end-to-end provider tests before actual plugin/MCP execution.
- Strong context isolation, security and prompt-injection tests. The current context is model guidance, not an isolated model sandbox.

No public deployment or production readiness is implied by source changes or passing unit tests.
