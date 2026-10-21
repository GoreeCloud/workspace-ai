# Project navigation and chat composer (development)

## Project sidebar
- Pin or unpin projects to the top of the Projects sidebar group without changing which project owns a chat.
- Drag a project to reorder **within its pinned or unpinned group**. Keyboard-accessible Move Up/Down buttons provide the same control on desktop, mobile and assistive interfaces.
- Pin a chat from its row or chat three-dot menu. When viewing a project, its pinned chats appear above unpinned chats, and pinned project chats are exposed beneath that project in the sidebar. Unrelated projects' pinned chats are never mixed in.
- Project order and project pins are browser-local workspace settings, included in encrypted account-sync snapshots only when the separately configured sync gateway is enabled. Backup restores validate IDs and discard stale references.

## Chat header
- Back returns to the active project or All Chats, not browser navigation history.
- Three-dot menu: Share (explicit confirmation, native share or clipboard fallback), Pin/Unpin, Remove from Project, Search Chat, Archive/Restore, Export, Settings and Delete (explicit confirmation). Removing a chat from a project preserves visible messages but creates a fresh AI context boundary, as with the existing reassignment behavior.
- Archive hides a chat from active sidebar lists and moves it into Archived; archive is reversible. Delete is permanent in the local workspace and removes the pin reference.
- Chat search filters visible message history locally; no external search endpoint is used.
- Full-screen is a focused in-app chat presentation that hides the sidebar; it is not browser fullscreen permission.

## Composer attachments
- Bottom-left plus menu: Camera, Photos, Files and Saved Prompts where available. Camera uses the browser's native capture chooser when supported.
- Supported uploads: JPEG/PNG/WebP images and small UTF-8 text/code files. The browser compresses images to JPEG, max 1024 px and ~135KB binary; total 3 attachments per outgoing message, 2 images max on the server. Unsupported binary/PDF formats are not silently interpreted.
- Images require explicit OpenAI API provider selection and a separately billed configured API key. The server validates each image signature, MIME, length and count. ChatGPT-plan and automatic fallback routes reject image requests. Text attachments are bounded and supplied as text to the selected model.
- Attachments in sent chats remain browser-local and appear in portable backups (subject to the existing 12 MB backup and browser quota caps). Account sync will contain them only when explicitly enabled, encrypted, and the gateway is deployed. Local-only users can lose their photos on browser reset. Save originals separately.
- The microphone button uses browser SpeechRecognition for **dictation**, only on user action and only where supported. Browser speech implementations may contact a browser speech service. This is not a complete hands-free duplex or MCP voice-chat integration.
- The Send button streams responses through the existing endpoint. Images can incur API charges; explicit provider routing is required.

## Limitations to qualify before release
- Real mobile capture flow on Android and iOS, actual OpenAI vision-model support, speech permission prompts, high-contrast/dark-mode menus, accessible keyboard and touch behavior, browser storage quota errors and large backup restores.
- Multi-image follow-up context retains original image previews; earlier images are not re-sent automatically to the model on later turns.
- The app remains limited to 50 chats per local store. No public shareable URL is generated; sharing copies actual conversation text only after a user gesture.
- A successful CI run demonstrates synthetic checks and build integrity, not actual provider image understanding or production deployment.
