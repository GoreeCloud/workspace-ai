# Workspace AI Engineering Studio

Engineering Studio is a **development-stage planning and agent-team initialization tool**, not a fully autonomous software builder.

## Verified capabilities

- Prepare a structured, project-associated GoreeCloud engineering work order with a selected `GoreeCloud/<repository>` and target platform.
- Include eight explicit verification gates: requirements, architecture, implementation, tests, security, OS-native build, UI/accessibility QA, and release-candidate verification.
- Export a portable JSON work order and copy a detailed development prompt for a separate chat.
- For an existing Workspace AI project, create four scoped agents (research/architecture, developer/implementation, reviewer/verification, coordinator), using the existing project-isolation and 60-agent capacity rules.
- Existing Agent Studio can run selected project agents, up to four concurrently, for model reasoning. This does **not** execute tools, compile source, push changes, or deploy services.

## Constraints

- The canonical owner account is `GoreeCloud`; alternative identities are never allowed for GoreeCloud GitHub changes.
- Work orders are `plan-only` and do not enable writes, deployments or critical command execution.
- The native operating-system requirement cannot be satisfied by PWA, WebView or Electron wrappers.
- Run results must be evidenced by actual builds, package verification, device/VM tests, accessibility QA, rollback plans, and owner-authorized promotion.
- Work orders are downloaded locally rather than silently uploaded or stored on the server.

## Next implementation milestones

1. Attach a permission-gated repository workspace with exact authenticated GoreeCloud GitHub account verification.
2. Execute isolated read-only inspection jobs and emit accurate per-tool activity events.
3. Implement per-repository ephemeral execution sandboxes with strict concurrency, CPU, memory, timeout and network limits.
4. Offer explicit approval and branch-scoped writes; require verified tests and security review before any merge.
5. Connect native Linux/Windows/Android/macOS/iOS build workers with reproducible package outputs and platform-specific runtime acceptance.
6. Provide artifact provenance and post-build QA reports with immutable evidence.

No milestone above is represented as shipped merely because the planning foundation exists.
