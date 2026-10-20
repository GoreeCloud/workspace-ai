# Live-linked project sources (read-only)

Workspace AI Projects support explicitly linked **local text files**, **nested local directories**, and **text files in an already-authorized Dropbox account**. The linked source's reference snapshot is updated by reading the source **while the Workspace AI Projects page is open**. The application never writes, renames, deletes, or moves the original.

## Setup and operation

1. Go to **Projects**, select a project, and locate **Live files & folders** in its Project files panel.
2. Choose **Link file** or **Link folder** in a browser supporting the File System Access API (typically current desktop Chromium); the browser will prompt for selection and read permission. The initial scan happens only after access is granted. Unsupported browsers retain the existing manual local import capability.
3. Alternatively, enter a precise Dropbox text file path (such as `/Documents/notes.md`) and choose **Link Dropbox file**. A preexisting Dropbox connection with `files.content.read` scope is required. The browser does not receive the Dropbox credential.
4. While the project view remains open and visible, the app checks linked sources about **every 60 seconds**, on return to a visible tab, or with **Refresh now**. It updates a bounded read-only text snapshot only when source content has changed.
5. If access expires or a file is moved, the current snapshot remains available and a refresh error is displayed. Use **Reconnect** to select the current source again or **Unlink** to remove the link and its project snapshot.

## Boundaries and limits

- At most **five sources per project** and **ten text snapshots total** across all manual/linked files; **64 KiB per file**. Unsupported extensions are skipped; invalid UTF-8 or binary text content is rejected and leaves previous snapshots intact.
- Directory scans are deterministic and bounded to three subdirectory levels, 200 visited entries, and 110-character relative paths. Hidden entries starting with a dot are skipped.
- Local browser handles are stored in **IndexedDB** in the active browser profile. Source descriptions and last-read text snapshots reside in the project's existing browser-local state and workspace backup. Browser handles are **not exported**. A restored or newly opened device might require reconnection.
- Auto-refresh requires that the project view is mounted and visible. It is **not a native background filesystem watcher**, and does not run when the application is closed, the mobile browser suspends the tab, or the local browser no longer has read permission. Browsers may require renewed access after restarts.
- Dropbox refresh is a fresh read from the existing restricted `/api/integrations/dropbox/import-text` endpoint. It depends on an available provider connection, network, read scope and Dropbox service; polling is not a Dropbox push notification or webhook. This implementation supports **linked Dropbox text files, not recursive Dropbox folders**.
- Google Drive live links, other remote folder synchronization, full-document indexing, and PDF/image/Office parsing are not yet supported. They require separate provider authentication, restricted download APIs, quotas and scope/identity verification.
- **Privacy:** file contents are sent only as part of the existing bounded project AI context when you chat in that project, including explicitly shared project references. Source selection does not itself trigger model inference.
- Revoking local or Dropbox access stops new reads but does **not** erase previously stored snapshots. Use **Unlink** to discard associated project reference copies.

## Verification and rollout

Synthetic tests cover source validation, read permissions, recursive scanning, last-known-good retention, file quotas, backup roundtrips, and Dropbox refresh. The production build and repository browser smoke are separate checks. **Do not claim real phone/laptop file-picker acceptance or a live Dropbox account synchronization without testing those environments.**

Release gates: supported browser UI testing, real offline/reconnect, source mutation, inaccessible folder, Dropbox revoked-scope and mobile fallback tests. This feature is source code on the development/main branch as verified by GitHub, not evidence of deployment to a running website.
