# Workspace AI — navigation and integration architecture

**Status:** Staged MVP; provider actions are not enabled. Interface follows [GoreeCloud/gc-ui](https://github.com/GoreeCloud/gc-ui); Glaze source and themes are prohibited.

## Navigation

The sidebar is ordered MCP, API, Projects, Pinned, All Chats, Settings. It is collapsible on desktop, uses title tooltips for icon-only navigation, and opens as an overlay on smaller displays. Expanded groups and compact-mode choice are saved under `workspace-ai-workspace-v1` in browser local storage.

Projects support create/delete, glyph selection, individual instructions and user-edited notes, opt-in one-way memory/file sharing, local text attachments, read-only Dropbox text imports, and chat moving/assignment. Pins and chat search remain browser-local. Project-specific integration choices are metadata only, **not** executable tool permissions. Google Drive import, binary formats, automatic memory and cloud synchronization remain unsupported. See [PROJECT_WORKSPACES.md](PROJECT_WORKSPACES.md) for limits and security boundaries.

## Local data portability (implemented)

Privacy settings now provide a versioned JSON archive with chats, local projects, and pins. Restore parses and validates the format and bounds (up to 50 conversations, 100 projects, 500 messages per conversation, and 12 MB JSON), supports nondestructive merge with ID conflict preservation, or explicit full replacement with a confirmation dialog. The app saves both browser keys before updating React state and attempts rollback on storage failure. Browser localStorage is not a transactional database; failures during rollback remain possible and should be handled by keeping an external backup.

OAuth credentials, API keys, MCP configuration, and integration sessions are explicitly excluded. The exported conversation text itself is user data and may contain sensitive information. No cloud sync is implied. All Chats supports conversation renaming; Ctrl/Cmd+K focuses search and Ctrl/Cmd+Shift+N begins a new conversation when settings are not open.

## Service catalog

| Service | Current connection path | Implemented now |
| --- | --- | --- |
| Todoist | API token | API v1 credential check and paginated, read-only project/task browser |
| Google Drive | OAuth registration required | Catalog and advertised capabilities only |
| Dropbox | API token | Read-only credential check |
| Linear | API token | Read-only credential check |
| Remote Desktop Commander | Administrator-provided MCP HTTPS URL | Remote tool discovery only |
| Gmail | OAuth registration required | Catalog and advertised capabilities only |
| Firecrawl | Administrator-provided MCP HTTPS URL | Remote tool discovery only |
| GitHub | GoreeCloud-only token | Identity validation and read-only credential check |
| Cloudflare Pages | API token | Token validity check |

The catalog is **not** the same as an active connected service. A successful token check does not prove every advertised permission or future operation will work. Tools are shown for discovery but marked non-executable, including those requiring approval. ChatGPT account connectors and this standalone application are not shared.

## Credential and security model

Token-based connections are kept only in the local Node server's memory. Server restart removes them, and the browser never stores their values. Provider checks use fixed endpoints, timeouts and no redirects. Requests that change connection state enforce the localhost Origin and Host boundaries. No MCP server can be added through arbitrary browser-submitted URLs; administrators explicitly configure HTTPS endpoints through local environment variables.

For a provider such as `remote-desktop-commander`, the local configuration names are:

```text
WORKSPACE_MCP_REMOTE_DESKTOP_COMMANDER_URL=https://approved-mcp.example/mcp
WORKSPACE_MCP_REMOTE_DESKTOP_COMMANDER_TOKEN=...
```

Keep these variables in a private local environment, not a public repository. The discovery protocol initializes the configured MCP server and enumerates advertised tools. Tool execution remains disabled. Custom service connection flows and encrypted persistent credential storage are future work.

## Before activating cross-service actions

Implement permission scopes per service and project, encrypted local credentials (or an OS secrets backend), authorization checks for every request, audit logs with secret redaction, explicit approval screens for sending messages/deleting files/commits/deployments, and provider-specific integration tests. Do not make AI-generated natural-language tool calls executable until all requirements are met.

## Quality gates

Use `npm ci && npm run check`, GitHub Actions, and desktop/mobile keyboard and visual checks. Confirm existing ChatGPT OAuth and separate optional OpenAI API routing still work after installing. Any production hosting needs authentication, tenant isolation and additional security work; the app is currently localhost-only.
