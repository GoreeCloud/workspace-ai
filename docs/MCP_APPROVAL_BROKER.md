# Local MCP approval broker — dry-run implementation

The standalone Workspace AI application now has an **opt-in server-held MCP policy and approval preview** that builds on the four-tier risk settings.

This work is an authorization control-plane milestone, **not a tool execution feature**. No MCP tools/call endpoint is exposed, no remote provider read or write happens, and project browser preferences do not grant server authorization by themselves. User-provided arguments are validated and briefly held in local server memory only to bind the action digest.

## Operator opt-in

1. Create a unique, random owner secret of at least 32 characters (for example, generate it locally with a password manager or an appropriate secure random generator).
2. Set WORKSPACE_MCP_OWNER_KEY in the *local Workspace AI server process environment* and restart the server. Never commit this value, paste it into an issue, or put it in a GitHub Actions log. Without a qualifying secret, all owner-authorized endpoints return 503.
3. Open Projects → select a project → Plugins & MCP access profiles. Enable the intended MCP provider and choose its reviewed tools, read/write switch and risk ceiling. The default is deny.
4. Under Local server policy and approval dry-run, temporarily enter the owner secret and choose Register server policy. The browser does not save this secret to localStorage, workspace backups or project records. Close the editor to clear its temporary React state.
5. Stage a reviewed allowlisted tool with exact JSON arguments. For Medium and High risks, explicitly type APPROVE. For Critical, type APPROVE and separately type CONFIRM CRITICAL. These values only acknowledge a temporary local dry run.
6. Click Validate and consume: the server checks policy and one-use expiry, then reports policyValidated=true and executed=false. This is **not proof of live provider access**, and does not permit any tool operation. Repeated consumption fails.
7. Revoke the project server policy to remove its pending approvals immediately. Provider disconnect or rediscovery also clears that provider's grants.

## Boundaries, invariants and limitations

- The owner secret is checked with a constant-time SHA-256 digest comparison. Privileged routes also require an exact allowed local Origin. The server itself binds only to loopback/approved Host via its existing middleware. This is a local single-operator mechanism, not multiuser sign-in.
- Server-side policy is a copy explicitly registered by the owner, kept only in server process memory for **15 minutes**, never automatically synchronized from the browser. Changing a browser selection does not by itself update the server; you must re-register or revoke it. Pending requests are immediately invalidated when a server policy is replaced or revoked, or an MCP connection is re-discovered/disconnected.
- Action digests bind a random request ID, server revision, expiry, project identity, provider, reviewed tool name and exact serialized JSON arguments. Pending actions expire within five minutes; only 32 can be outstanding. Each can be consumed once and only by an owner-authenticated origin.
- The fixed server-reviewed tool registry is the source of mode/risk information. Unreviewed tools remain blocked, even if declared harmless by an external MCP server.
- The limited in-memory audit keeps the last 120 actions with timestamp, event, provider, project and risk, **without raw tool arguments or secret keys**. It is not a durable, tamper-evident audit and resets on restart.
- This phase provides policy preflight and dry-run approval validation only. The policy broker never accepts client-reported connection status as proof of provider authorization. A later version requires authenticated provider adapters, independent verification of access scopes and identities, server-side enforcement at time of execution, durable audit/storage and per-action approval binding to an actual executor.
- No current ChatGPT connector or MCP permissions automatically carry into the standalone Workspace AI app. The owner-key grant is not OAuth.

## Endpoints

| Endpoint | Purpose | Execution |
|---|---|---|
| GET /api/mcp-approval/status | Whether a local owner key is configured | Never |
| POST /api/mcp-approval/projects/:projectId | Owner-register project policy for 15 minutes | Never |
| POST /api/mcp-approval/projects/:projectId/revoke | Revoke that server-side project grant | Never |
| POST /api/mcp-approval/stage | Stage a bounded, digested tool request | Never |
| POST /api/mcp-approval/approve | Bind explicit per-action approval to exact request | Never |
| POST /api/mcp-approval/consume-dry-run | One-time policy-only validation | Never |
| GET /api/mcp-approval/audit | Redacted, owner-only audit | Never |

All privileged endpoints use Bearer owner-key authentication and exact local-origin checks. Defaults remain off.

See [MCP Risk Permissions](MCP_RISK_PERMISSIONS.md) for all four tiers and the separate runtime execution requirements.
