# Workspace AI caching architecture

## Current implementation (development PR)

1. **Public bundle cache.** The service worker retains a bounded set of fingerprinted Vite JS/CSS/assets and uses cache-first for those immutable filenames. Known manifest/favicon/icon paths stay network-first with offline fallback. Browsers may reuse immutable hashed assets through HTTP cache. Never cache the page shell, chat content, API routes, authorization, OAuth callbacks, account state, or user-specific requests.
2. **In-process model catalog cache.** A short-TTL (60-second), 24-entry bounded cache coalesces simultaneous model-catalog lookups. Keys use the verified active account and SHA-256 fingerprint of the active access token, never the literal token. Requests re-check current account scope. Failed lookups are not cached, and a token rotation naturally uses a new entry. No catalog is retained to disk or returned to another account.
3. **API prompt-prefix affinity.** Separately billed OpenAI API requests send a stable, ephemeral HMAC-based `prompt_cache_key` scoped to the account/credential/model/first message. The key contains no raw text, and this implementation does not enable 24-hour provider retention. OpenAI may use provider-managed prompt caching for eligible repeated prefixes; benefits depend on model, prompt length and actual usage. Plan requests are unchanged.
4. **Measured token reuse.** Workspace AI reads the upstream completed response's `input_tokens_details.cached_tokens` and shows only actual provider-reported cached input token counts. It does not equate cached input tokens to zero cost, and does not invent cost savings or promise lower total token counts.

The cache is **not** an answer cache: stale answers, dynamic web results, proprietary document contents, private chat transcripts, raw tool outputs, secrets, and authentication are never put in a shared cache. No change permits model-initiated tool execution.

## Validation

`npm run check` plus `tests/cache-layers.test.mjs`; isolated loopback tests for status and HTTP headers; manual browser refresh/offline asset and account-switch checks are still required before a release.

## Follow-on options (not implemented)

- Source-versioned, project-scoped retrieval caches with permission/revocation invalidation and storage encryption.
- Explicit opt-in exact-response replay for non-sensitive deterministic tasks, guarded against temporal questions and cross-account reuse.
- Usage reporting and cache-clearing controls with measured latency/cost baselines.

Do not describe these future options as shipped.
