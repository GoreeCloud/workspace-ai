# Workspace AI — local multi-account sessions

**Source status (October 21, 2026):** Local account-switcher source merged to `main` via [PR #50](https://github.com/GoreeCloud/workspace-ai/pull/50) at `1571e55a3c6d0bd4bb7637fe34ed204ff21a4e18`. [Merged-main CI](https://github.com/GoreeCloud/workspace-ai/actions/runs/39571137685) passed automated tests, build and synthetic browser acceptance. Actual two-identity OAuth switching, production installation, and hosted multi-user tenancy have **not** been verified.

## User workflow

Workspace AI can retain up to five distinct ChatGPT OAuth account sessions in a single local installation. Settings → Connections displays the signed-in account, the saved-account switcher, Add Account, Reauthorize, Sign Out and a separate Local-only Guest choice.

- **Add account:** Starts a fresh OAuth attempt without the previous account's subject restriction or login hints. The upstream OAuth provider must verify the selected identity. The callback checks issuer, signature, audience, nonce and subject before saving it. No browser-side OAuth tokens.
- **Switch account:** Selects an already authenticated saved account on the local server and reloads the app. The server must supply the new verified account ID before its browser data is opened.
- **Sign out:** Tries to revoke the currently active refresh token, removes only that saved account from the local server, returns to Guest and preserves the other saved account sessions. If remote revocation fails, the user is warned and should disconnect the app from their ChatGPT account settings.
- **Guest:** Uses the exact preexisting browser-local workspace keys. Signing in never automatically copies guest project memory, chats or file attachments into a new account. Use an explicit, trusted backup export/import if transferring data is intentional.

## Browser account isolation

Authenticated accounts use a 24-character SHA-256-derived identifier from the OAuth-verified subject for storage namespacing. Conversation history, project memories/settings, agent definitions, archived/pinned chats, appearance and account-sync ownership metadata are scoped separately. The HTML app loads only after receiving a successful local server status; unverified or unreachable status shows a locked screen without accessing browser storage.

Chat and plan-model requests carry their verified active-account ID; a tab retaining an old ID is rejected if another tab switches the local server. A periodic identity check also hides the old UI if the active account changes. Browser tabs and other independent clients on the same OS user can still select any retained profile because the server has **no per-browser sign-in session**.

The local sync gateway, when configured and actually deployed, still requires an explicit end-to-end encryption passphrase for each account and preserves the server-side identity check. Without a deployed gateway, sign-in is NOT cross-device synchronization and loss of browser data can permanently destroy local history.

## Deliberate security boundary

**This is multiple saved sign-ins for one trusted operator's loopback installation, NOT public multi-user hosting.** The existing app binds to 127.0.0.1, and it does not authenticate each browser user. Anyone able to operate the same OS user's trusted local browser/server may be able to switch to saved accounts. Do not expose the server on a network or share one OS/browser profile with untrusted people.

OpenAI API keys configured on the server, MCP integrations, local scheduled agents, owner keys and account-sync hosting setup are not isolated for independent hosted users. True secure multi-user support requires per-browser session cookies and CSRF protection, account-bound API/MCP credentials and resource grants, server-side tenant storage, authorization for every endpoint, quotas, audit controls, secure recovery and real browser/device tests.

## Acceptance, privacy and rollback

- Synthetic registry and storage isolation tests plus repository CI, build and synthetic browser checks should pass at the exact PR head.
- Test two **authorized real identities** in a staging installation: A → B → A, sign-out one account, OAuth reauthorization, refresh-token races, two browser tabs, stale chat request rejection, backup export/import consent, guest restoration and corrupt storage.
- Verify camera/photo uploads, settings, memory isolation, account-sync pause, server model routes, background schedules and per-device recovery do not cross account boundaries.
- All secrets remain server-side in private credentials storage. Do not log or export tokens. Revocation may be unconfirmed.
- Rollback by reverting the isolated source feature. Preserve existing guest localStorage and server credentials file backups. Changes to the credentials profile are made only after an authorized live sign-in, not by the source merge itself.
