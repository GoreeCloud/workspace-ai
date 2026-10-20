# MCP Risk Permissions

Workspace AI offers project-specific **Read** and **Write** switches, each with a separate maximum risk tier. Every tool also requires an explicit per-project allowlist selection. All controls default to disabled.

**Current limitation:** MCP tool execution is disabled. These settings are saved preferences, not live execution grants or provider permissions. An authorized, authenticated server execution engine and per-action approvals must be built and tested before any tool can actually run.

## Four tiers

| Tier | Examples (illustrative only) | Minimum approval requirement for future execution |
|---|---|---|
| **Low Risk** | List non-sensitive metadata | Explicit per-tool grant plus verified provider and server authorization |
| **Medium Risk** | Read ordinary web content; create a low-impact task | Per-operation approval |
| **High Risk** | Sensitive reads, larger crawls, important content changes | Explicit confirmation of each operation |
| **Critical Risk** | Execute commands, change credentials, delete important data or privileges | Separate critical confirmation in addition to all other checks |

Read operations can carry High or Critical risks (for example, exfiltration of secrets). Write operations may have Low risk only when narrowly scoped and reviewed. The tool description, filename, self-declared annotations or user text must never downgrade a classification.

## Reviewed tool registry

- Remote Desktop Commander: devices.list = Low/Read, process.execute = Critical/Write
- Firecrawl: web.scrape = Medium/Read, web.crawl = High/Read
- Unknown or unreviewed discovered tools = Critical/Write, **blocked pending review**, even when Critical is selected.

## Effective checks

The shared policy function evaluates project provider membership, independent read/write switches, the risk ceiling, exact tool allowlist, reviewed server-side classification, provider connection, server authorization, supported execution, per-operation approval and (for Critical) distinct confirmation.

Actual Workspace AI MCP discovery and metadata routes continue returning executionEnabled=false. There is no authorized tool invocation route. The opt-in [Local MCP Approval Broker](MCP_APPROVAL_BROKER.md) adds 15-minute owner-registered server policies, short-lived, single-use approval dry runs, and redacted in-memory audit; its response always reports executed=false.

Local project and backup metadata is untrusted preference data, not a server grant. A future authenticated execution server must store and enforce authoritative permissions independently, bind approvals to single-use action digests, expire/revoke approvals on disconnect/policy change, and keep an audit trail with safe redaction. It must handle idempotency, cancellation, service/provider scope enforcement and real device tests before enabling tool calls.

See PROJECT_WORKSPACES.md for project privacy and interoperability boundaries.
