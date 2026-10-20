# Standalone Google Workspace connection — opt-in and read-only

This is an **isolated development patch** for GoreeCloud Workspace AI. Do not claim it has been merged or deployed until its exact source branch has passed the full repository checks and merge is verified. It does **not** reuse the ChatGPT Gmail or Google Drive connectors. The Google account is pinned to `goreecloud@gmail.com` using the verified Google OpenID user-info endpoint.

## Developer setup (not automatically performed)

The authorized maintainer must register a **Google OAuth web application** through a suitable Google Cloud project, configure an appropriate consent screen and activate Gmail and Drive APIs. For the local standalone server (default port 3031), register this exact redirect URI:

`http://127.0.0.1:3031/api/google/callback`

Set these **only in the local server process environment**; never commit real values, place them in browser storage, or paste them into logs:

- `WORKSPACE_GOOGLE_CLIENT_ID` — OAuth web application client ID ending in `.apps.googleusercontent.com`
- `WORKSPACE_GOOGLE_CLIENT_SECRET` — matching confidential OAuth client secret
- `WORKSPACE_AI_PORT` — default `3031`, when a different port is configured the Google redirect URI must match it exactly

Restart the local server after setup. The feature is **disabled without valid credentials**. Use the Project's API integration preferences to enable Gmail and/or Google Drive, then open the Project multi-provider overview and explicitly connect each service.

## Permissions requested

| Service | OAuth scope requested | Implemented action |
|---|---|---|
| Gmail | `https://www.googleapis.com/auth/gmail.readonly` | Search Gmail and read only subject/from/snippet metadata for up to 10 messages |
| Google Drive | `https://www.googleapis.com/auth/drive.file` | List files previously authorized to this app and explicitly preview an authorized, UTF-8 text file up to 64 KiB |
| Google identity | `openid email` | Validate verified account email against `goreecloud@gmail.com` |

**Important:** `gmail.readonly` is a **restricted scope** under Google's policy and may require app verification and additional security assessment when used in production. `drive.file` is narrower by file selection, but is technically **write-capable** as an OAuth scope. This patch exposes **GET/read-only routes only** and has **no create/update/send/delete endpoints**. Later Drive writes require a separate approved adapter and per-action risk authorization. A separate Google Picker integration is needed to authorize existing Drive files with `drive.file`; a broad Drive scope is **not** requested as a shortcut.

## Privacy and security

- The OAuth authorization-code exchange uses **PKCE S256**, cryptographically generated server-held `state`, a one-time 5-minute attempt, and fixed Google OAuth endpoints. State is consumed even when a callback fails.
- The token exchange uses the configured server-only client secret; credentials and access tokens **never enter browser settings, project memories, backups, URLs, or logs**.
- Short-lived access tokens reside **only in process memory**, capped to one hour, and expire/revoke on server restart. No refresh token is requested; no persistence. If renewed access is needed, explicitly reconnect through Google.
- Scopes are requested separately. Gmail search and Drive files cannot reuse each other's access token or provider grant; an invalid provider scope is rejected.
- Callback uses a fixed local redirect rather than an arbitrary user URL. Every state-changing route requires an allowed local Origin. API responses never expose raw tokens, OAuth codes, or client secrets.
- Revocation clears local sessions and prevents subsequent local reads. **Remote revocation is not confirmed**; remove access through Google Account permissions when necessary.
- Provider responses are limited in size and returned as sanitized display fields. File contents are shown only in the Project browser view and never automatically inserted into a model conversation, shared project memory, or another provider.
- Browser-side Project selection is a **preference filter, not server-authenticated per-project authorization**. Real multiuser project isolation requires a separately reviewed identity and permission model.

## Read endpoints

- `GET /api/google/status` — configuration and connection boolean only
- `POST /api/google/start` — start separate Gmail/Drive OAuth flow (requires local Origin)
- `GET /api/google/callback` — one-time Google callback (redirect only; no tokens in URL)
- `POST /api/google/disconnect` — clear a specific in-memory local session
- `POST /api/google/gmail/search` — bounded Gmail query and metadata-only results
- `GET /api/google/drive/list` — bounded list of app-authorized Drive files
- `POST /api/google/drive/read` — explicitly selected, bounded UTF-8 text file only

**No write API** is included. The complete Gmail → GitHub → Todoist → Drive workflow still needs a user-approved cross-provider transfer mechanism, trusted server project identity, reviewed Todoist and Drive write adapters, durable audit and recovery, and real OAuth/provider acceptance tests.

## Validation and release gates

The bundled Node tests use synthetic OAuth callbacks and Google API responses. They cover state replay, PKCE, wrong account rejection, insufficient scopes, permission expiry/revocation, metadata-only Gmail search, Drive scope/file restrictions, fixed read-only method behavior, and local-origin protection. **The bundled tests are synthetic.** After applying this patch to the latest Workspace AI development checkout, `npm run check` passed with 128 automated tests and the Vite production build passed. These results are not a Google account acceptance test, GitHub CI result, or production release. The application requires the user to complete Google Cloud OAuth setup. Production rollout should include Google verification as required, browser interaction tests, quota and rate-limit testing, credential compromise recovery, and exact-source CI/merge review.

Official references: https://developers.google.com/identity/protocols/oauth2/web-server ; https://developers.google.com/workspace/gmail/api/auth/scopes ; https://developers.google.com/workspace/drive/api/guides/api-specific-auth
