# Workspace AI local API reliability

Development update. The app-level JSON transport centralizes local-origin requests to `/api/`, validates JSON responses and their object shape, preserves account-scope headers, and gives actionable errors for offline services, HTTP failures, incomplete JSON and timeouts. Requests abort after 60 seconds and no mutating operation is automatically retried. The transport uses same-origin credentials and `no-store` caching to avoid treating stale responses as fresh state.

This refactoring covers App.jsx JSON control requests only; existing streaming chat, provider image calls, and other independent connector calls are **not** rewritten. No production deployment, browser/device QA, or native OS acceptance is claimed from its unit tests. The feature should remain in a separate PR until its repository tests and CI pass.
