# GoreeCloud Workspace AI

A local-first, open-source AI chat workspace with **Sign in with ChatGPT** plan access and an optional, separately billed **OpenAI API** fallback. This is an independent GoreeCloud application, not the official ChatGPT client.

## Features

- Responsive desktop/mobile chat interface, streaming replies, conversation history, Markdown rendering, and export.
- ChatGPT open-source OAuth registration with PKCE, ID-token validation against OpenAI's JWKS, and explicit `chatgpt.tokens.use.direct` permission checks.
- Eligible per-account model selection via OpenAI's model catalog.
- Plan-only, API-only, and automatic plan-first routing, with API fallback **off by default**.
- Server-side API credentials and protected local OAuth tokens; no tokens sent to browser storage.
- Browser-local chat history. Responses requests use `store: false` and `stream: true`.

## Run locally

Requires Node.js 20+.

```bash
git clone https://github.com/GoreeCloud/workspace-ai.git
cd workspace-ai
npm ci
npm run check
npm start
```

Open **http://127.0.0.1:3031**. `npm run check` builds the frontend and runs the test suite; `npm start` serves both the built frontend and API on loopback only.

For development with Vite hot reload, run `npm run dev` and open **http://127.0.0.1:5173**. After the OAuth callback, the default redirect uses the built app at port 3031.

To connect a ChatGPT subscription, open **Settings & connections** and choose **Continue with ChatGPT**. An eligible plan and the user's approval are required; sign-in alone does not authorize plan usage.

For optional API access, open **Settings & connections → OpenAI API**, paste your key into the password field, and select **Use key**. This key stays in the local server's memory only, is not returned to the browser, and must be entered again after a server restart. For persistent configuration instead copy `.env.example` to `.env`, set `OPENAI_API_KEY`, and restart. In Settings choose API-only or opt into automatic fallback. API usage is billed separately and is **not** included with ordinary ChatGPT Plus.

## Security and scope

- The backend binds only to `127.0.0.1`. It is not a multi-user hosted service. Do not expose it to the public Internet or place it behind an unauthenticated reverse proxy.
- OAuth credentials live in `~/.config/workspace-ai/credentials.json` with owner-only permissions. API credentials belong in the local environment. Neither is committed to GitHub.
- History is stored in the browser's local storage until removed or site data is cleared. The app does not import ChatGPT chats, Projects, custom GPTs, memory, plugins, or tools.
- Usage limits, model availability, eligibility, and revocation are managed by OpenAI. Review access in ChatGPT settings.
- Successful sign-in, live model inference, and paid API billing require actual authorization/credentials; automated tests do not prove these flows.
- The app is a development build, not a production-ready public deployment. Browser-level accessibility and live OAuth tests remain acceptance tasks.

## References

- [Open-source Sign in with ChatGPT](https://developers.openai.com/siwc/token-sharing-open-source)
- [OpenAI sign-in registration](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
- [Models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)
- [Sign in with ChatGPT Terms](https://openai.com/policies/sign-in-with-chatgpt-terms/)

## License

AGPL-3.0-or-later — see [LICENSE](LICENSE). Copyright (c) 2026 GoreeCloud.
