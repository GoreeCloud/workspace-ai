# Project GitHub source-file reads (read-only)

Projects can preview a specific UTF-8 source/text file from a repository owned by the **GoreeCloud** GitHub identity, using the standalone Workspace AI application's already-verified GitHub token. This is an explicit read, **not** a cross-provider workflow or a repository write.

## How to use
1. Under API integrations, connect and verify the authorized GoreeCloud GitHub account.
2. Select GitHub in the desired project's integration preferences.
3. Open Project → Plugins & MCP access profiles → Multi-provider overview → Read GitHub source file.
4. Enter a GoreeCloud repository name such as `workspace-ai` and relative source path such as `src/App.jsx`, then choose **Read selected file**.
5. The server reads GitHub Contents API metadata and returns up to 64 KiB of UTF-8 content; the app displays only the first 16,000 characters on this screen. The text is not added to project memory, chat context, Dropbox or another provider.

## Security constraints
- Fixed provider host (`api.github.com`), fixed owner (`GoreeCloud`), existing server-held token, revision guarded session, no redirects, short timeout.
- Rejects directory traversal, absolute paths, credential/key-looking files, unrecognized file extensions, non-base64 content, binary/invalid UTF-8, mismatched sizes, provider error text, and oversized payloads.
- Requests are GET only. No arbitrary ref, branch, organization, or external URL is accepted. Reads repository default-branch file contents; no history or recursive browsing implemented.
- Local API route `GET /api/integrations/github/source?repo=...&path=...` enforces the same-origin protections as other read routes and invalidates expired credentials after 401. The browser never receives the token.
- An app-side project checkbox is convenience filtering and **not server-enforced project identity**. Server reads require an existing GitHub connection, but this does not constitute a fully authenticated, server-held project authorization.
- Returned GitHub file contents are untrusted external data. They cannot direct MCP execution or override project/tool risk policies.

## Follow-on work
A real multi-provider workflow still needs independently authenticated Gmail and Drive OAuth, a Todoist create-task adapter, explicit cross-provider transfer consent, per-write action approvals, an authenticated project authorization server, durable audit/recovery, and live end-to-end provider verification.

Synthetic tests cover path/owner validation, token handling, byte-size limits, UTF-8 rejection, race-safe revocation, and status errors. Browser and real token/provider acceptance tests remain to be completed before a production rollout.
