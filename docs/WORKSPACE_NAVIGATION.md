# Navigation and integrations milestone
Work in progress; do not merge without end-to-end App wiring and CI verification.

Sidebar order: MCP, API, Projects, Pinned, All Chats, Settings. Collapse preferences, pinned chats and projects are designed for browser-local storage.
Service catalog: Todoist, Google Drive, Dropbox, Linear, Remote Desktop Commander, TinyFish, Gmail, Firecrawl, GitHub and Cloudflare Pages.
Token verification supports only explicitly allowlisted read-only endpoints; GitHub must match GoreeCloud. Google Drive/Gmail require registered OAuth. MCP servers require administrator-configured HTTPS endpoints for tool discovery; no remote tools may execute at this stage.
No source-code or token inheritance from ChatGPT-connected apps. High-impact tool execution remains disabled, and cross-platform workflows are not yet enabled.
GC UI is mandatory; Glaze and Glaze UI are excluded.
