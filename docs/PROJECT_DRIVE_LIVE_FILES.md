# Project live Google Drive text links

Projects can link **already-authorized** Google Drive text files through Workspace AI's separate OAuth connection. Users enable Google Drive in a Project, open its Live sources panel, click **Load authorized files**, select a file and choose **Link Drive file**.

Files refresh read-only about every 60 seconds while the Project page is open and visible, or using **Refresh now**. Refresh uses the existing origin-gated server `POST /api/google/drive/read` route with the server-held Google token. Neither the original file nor provider permissions are modified. A failed read retains the last successful text snapshot.

The app enforces five linked sources, ten total text attachments and 64 KiB per file. Linked metadata includes an opaque file ID and display name; snapshots remain in browser-local Project storage and may be included in Project backups and explicitly shared context. To remove that stored copy, use **Unlink**.

**Limits:** Only files already authorized for the app under `drive.file` are selectable. Google Picker for previously ungranted files is not implemented; the app must not request broad Drive scopes as a workaround. Native Docs exports, Drive folder syncing, real connected OAuth/device acceptance, closed-tab refresh, and automatic inter-provider writes are not claimed. Project selection is not server-held project identity.

See [Google OAuth setup](GOOGLE_OAUTH_READ_ONLY.md), [Linked source limits](PROJECT_LIVE_SOURCES.md).
