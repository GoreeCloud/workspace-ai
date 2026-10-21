# Chat tool-activity icons

Workspace AI renders a compact, accessible, provider-specific activity row for **each actual tool invocation** recorded in an assistant message. The row includes a small glyph, action label, provider name, and an execution state. Unknown providers use a generic tool glyph instead of disappearing.

## Stream contract

The chat response's existing NDJSON stream may carry a server-originated record of this shape:

```json
{"type":"tool","id":"invocation-unique-id","provider":"google-drive-mcp","name":"files.read","label":"Reading project requirements","status":"running"}
```

A subsequent event with the **same ID, provider, and name** may mark the invocation `completed`, `failed`, or `cancelled`. The browser also supports `queued`; an unfinished invocation is marked `interrupted` when the response ends or fails. The backend is responsible for creating the unique ID and reporting only tool events grounded in actual execution. Labels are concise user-facing descriptions and MUST NOT contain secrets, raw arguments, returned documents, or untrusted execution claims.

The browser bounds count and text lengths, rejects malformed records, and does not treat activity messages as authorization or proof of success. Changes to executable tools still require the existing security broker and permission checks.

**Current limitation:** The present `/api/chat` route streams model responses, but does not itself initiate or emit MCP tool calls. This UI is wired to render tool events **when a trusted chat backend emits them**; it does not represent unexecuted or approval-only operations as completed. Live tool execution requires a separately reviewed backend integration and runtime acceptance.

## UI acceptance

- All recorded invocations appear, including running, completed, failed, cancelled, and interrupted.
- Recognizable glyphs for Drive, GitHub, Todoist, Gmail, Calendar, Dropbox, Linear, Notion, Firecrawl, and Remote Desktop Commander; unknown providers use a generic glyph.
- Compact desktop/mobile layout, readable theme colors, screen-reader status, and reduced-motion support.
- No raw tool arguments or results are exposed in the chat activity view.
- Verify with `node --test tests/chat-tool-activity.test.mjs` and `npm run check`; the live application still requires tool-event integration testing.
