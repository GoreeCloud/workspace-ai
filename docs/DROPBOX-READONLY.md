# Dropbox read-only folder browser

Workspace AI's Dropbox integration can list folder and file **metadata** after the user connects a Dropbox token in the local API dashboard. It does not download, upload, modify, share, or delete files.

The local server uses the fixed Dropbox API v2 `/2/files/list_folder` and `/2/files/list_folder/continue` endpoints with a maximum of 50 results per request. Requests are scoped to the existing volatile server-side token and verified for local Origin; stale responses after disconnect or token replacement are dropped. Authentication and permission scopes remain managed by Dropbox.

The browser supports folder traversal and cursor pagination without exposing the underlying access token. This is not a production multi-tenant secret-storage mechanism, and a successful token check is not proof of every Dropbox permission.

Quality gates: `npm ci && npm run check`, synthetic route tests, responsive browser checks, and GitHub Actions. No live user files or credentials are required for automated tests. UI follows [GoreeCloud UI](https://github.com/GoreeCloud/gc-ui) semantic tokens, not Glaze.
