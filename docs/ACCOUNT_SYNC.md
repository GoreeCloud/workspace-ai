# Account sync development

Account sync is opt-in, requires a separately deployed approved HTTPS gateway, and is not active on the standalone localhost app without configuration. Login alone does not synchronize data across devices.

When enabled, browsers encrypt portable workspace snapshots using a user-controlled 12+-character passphrase, PBKDF2-SHA256 and AES-256-GCM. The sync gateway verifies OpenAI-signed account identity tokens against an administrator allowlist of OAuth audiences, stores encrypted snapshots per verified subject, and uses compare-and-swap revisions to reject stale updates.

Start the local gateway with `node server/sync-service.mjs` behind an administrator-managed HTTPS proxy. Configure `WORKSPACE_SYNC_OAUTH_CLIENT_IDS` on the gateway and `WORKSPACE_SYNC_GATEWAY_URL` (approved gateway HTTPS origin) on each local application. The gateway listens on loopback port 3044 by default. Production hosting, reverse proxy security, quotas, rate limiting, audits and recovery drills remain outstanding.

Data synchronized: project configuration, approved project memories, project files, agent definitions, conversations, prompts and appearance. Not synchronized: provider credentials, OAuth tokens, API keys, server-held scheduled agents, or authenticated MCP account connections. MCP profile metadata and intended resource scopes do not create actual provider access grants.

The local-only option retains data solely in browser storage. Device/browser loss or clearing storage can permanently erase it. A signed-in user cannot continue work on another device until the shared sync gateway is deployed and the user unlocks it with the same passphrase. If the passphrase is lost, remote ciphertext cannot be recovered. The app requires explicit confirmation before restoring remote data over local work. Concurrent changes are stopped on revision conflicts, not automatically merged.


## Recovery and identity hardening

- Before replacing browser-local data with the account snapshot, the client checks that the **same signed-in account** remains active and that the encrypted remote snapshot revision has not changed since unlock. If either check fails, the restore is refused without replacing local data.
- After successfully restoring an existing snapshot, the client establishes a new local synchronization baseline instead of immediately re-uploading the previous device's data. Subsequent verified edits sync normally. Changes arriving while an upload is in flight are revisited.
- If the previously verified OpenAI identity token expires, sync requests are denied until reauthorization. The local OAuth refresh flow validates a newly supplied identity token and refuses to overwrite a switched account during an in-flight refresh. If OAuth refresh does not return a renewed identity token, the user must sign in again.
- Gateway snapshot reads require a private regular file and reject symlinks, unsafe permissions, oversized files and malformed revisions using file-descriptor checks before reading user ciphertext. This reduces filesystem replacement risks; it does not create a multi-process transactional database.
- Users should keep separate backups and should not rely on a single synchronized ciphertext revision as a substitute for tested restoration.

The expanded MCP catalog supports discovery for Todoist, Drive, Gmail, GitHub, Dropbox, Linear and Notion MCP endpoints configured separately by an administrator. Discovered tools are not auto-authorized or executable; the reviewed server tool policy and owner approvals remain in force. Real multi-account provider authentication and scope enforcement require additional backend adapters and acceptance tests.
