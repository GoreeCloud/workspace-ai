# Opt-in MCP execution gates

**Status:** Source implementation, not production deployment or live provider verification. MCP execution is **OFF by default**. The existing approval dry run continues to operate independently.

The separate owner-authenticated POST /api/mcp-live/execute endpoint accepts only an existing staged action ID and digest. It retrieves exact tool inputs and server policy from memory; it does not accept browser-submitted tool names, arguments, endpoints or credentials. Staged approvals are claimed once **before network activity** and cannot be replayed after errors.

The server requires matching current MCP discovery and a reviewed exact-name tool. Immediately before tools/call it rechecks current project policy and provider discovery. Project or provider revocation blocks subsequent calls. This is single-operator/local-only; it does not expose AI/model-initiated execution.

## Server switches

All switches are absent/off by default. In an approved **isolated staging environment** only:

- WORKSPACE_MCP_OWNER_KEY: unique local operator key of at least 32 characters
- WORKSPACE_MCP_ENABLE_TOOL_CALLS=true: enables guarded live execution
- WORKSPACE_MCP_ENABLE_WRITES=true: additional opt-in required for ALL write-classified tools
- WORKSPACE_MCP_ALLOWED_CONTENT_HOSTS: comma-separated, exact hostnames for Firecrawl web reads; empty means no such reads
- WORKSPACE_MCP_ALLOWED_COMMANDS: optional exact complete command strings separated by ;; (not glob/regex); empty prohibits all command execution
- WORKSPACE_MCP_FIRECRAWL_URL/TOKEN and WORKSPACE_MCP_REMOTE_DESKTOP_COMMANDER_URL/TOKEN: separately authenticated and scoped MCP endpoints

Only the exact reviewed tools **firecrawl/web.scrape**, **firecrawl/web.crawl**, **remote-desktop-commander/devices.list**, and **remote-desktop-commander/process.execute** have validators. Actual installations may use different names/arguments; those are deliberately refused pending review. Content fetch URL hostnames must match the administrator allowlist; Critical command execution requires a separately approved full command plus the admin allowlist.

Both MCP discovery and reviewed tool execution now use the hardened HTTPS transport in real server operation. They pin DNS resolution to a validated public IPv4 address, verify TLS hostname/certificates, reject redirects and IPv4/IPv6 literal endpoints, and bound time, requests and response sizes. Discovery is read-only (`initialize`, initialized notification, `tools/list`) and **never calls `tools/call`**. Only explicit synthetic test transport injection bypasses network I/O, not any deployed route. Results are untrusted provider data and should not automatically become tool instructions or authorize subsequent actions.

## Release boundaries

Unit/contract tests using synthetic providers are **not** evidence of live provider access or end-to-end identity correctness. Before any deployment of live execution: verify provider identity/scopes, actual MCP tool schema, staging command sandbox, side effects/rollback, durable redacted audit, DNS/rebinding behavior, concurrency/idempotency, and real-device owner-approval UX. Approvals do not create the provider credential or override provider-scope limits. No live connections, production rollout or real write actions are claimed by this change.
