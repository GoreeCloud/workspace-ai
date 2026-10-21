# Smart Image Generation

**Development feature (draft PR #62): not deployed or accepted as a native OS application.**

## User workflow

Open **Smart Images** in Workspace AI's navigation. Enter an image prompt and choose:

- **Smart (Auto):** selects one generator based on the request. Typography, wordmarks and posters favor **Ideogram 4.5**; photo-realistic or transparent-background requests favor **GPT Image 2.5**; storyboard and infographic prompts favor **Nano Banana 2.1**. These are explainable heuristics, **not** a measured best-quality guarantee.
- **Manual:** select Ideogram 4.5, GPT Image 2.5 or Nano Banana 2.1 and keep that choice. GPT Image 2.5 uses the **Flare** variant for Speed or **Sunburst** otherwise.

Select **Priority**, **Aspect ratio** and **Count** (1–4). For Ideogram 4.5, the server maps the selected aspect ratio to its supported `size` presets (1024×1024, 1280×720, 720×1280, 1152×864 or 864×1152); GPT Image 2.5 and Nano Banana 2.1 instead use `aspect_ratio`. Output sizes may differ between models. Use **Check price (free dry run)** to request an unbilled Ideogram quote before explicitly clicking **Generate image**, which may consume API credits. There is no automatic provider retry or model fallback. The service also rejects identical concurrently running paid requests to help prevent double-submits.

## Credentials and integration

Use the provider form to configure a session-only Ideogram API key on the **local Node server**, or provide `WORKSPACE_IDEOGRAM_API_KEY` in the server's environment. This is a separately billed provider account; a ChatGPT subscription does not supply the credentials. Never store the key in frontend source, browser history, project exports or Git.

Provider calls use the fixed API host `https://api.ideogram.ai` and the documented `/v2/image/generate/{model}` endpoints. The server limits concurrent upstream operations, validates image URLs and prevents account-session changes from returning stale results. Credential switching invalidates in-flight responses; it does **not** cancel a provider operation that was already billed.

Generated URLs are temporary. Use the provided **Open or save** link while valid; server-managed image download/archival and editing existing uploaded images are not implemented.

## Boundaries and outstanding acceptance

REST generation is a user-initiated action. **MCP tool execution is not enabled** by this feature; an agent-driven adapter must use the approved broker, scoped grants and revocation controls.

Tests cover routing, manual locks, model endpoints, mock provider responses, cross-origin protection, credential lifecycle, and duplicate requests. GitHub CI passed. Live provider-priced output, actual final image hosts, desktop/mobile visual QA, native OS deliverables, accessibility acceptance and deployment remain unverified.

Official API documentation: [Ideogram API Overview](https://developer.ideogram.ai/ideogram-api/api-overview).
