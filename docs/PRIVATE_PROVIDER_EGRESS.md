# Workspace AI private provider connectivity

**Status: opt-in QA only. Not deployed.**

The default private smoke Compose file intentionally has no outbound internet route. The optional `compose.provider-egress.yaml` creates a separate provider connection service. Only that service joins an outbound Docker bridge; the workspace application remains on its internal network.

The connection service permits HTTPS CONNECT only to `api.openai.com:443` and `auth.openai.com:443`. It rejects private, reserved and metadata IP addresses before connecting. The application retains end-to-end TLS verification. No application ports or provider credentials are published by this overlay.

**Acceptance:** verify the merged Compose configuration, run policy tests, confirm that unapproved hosts are blocked, and validate a no-credential HTTP 401 response from OpenAI's model-list endpoint inside an isolated QA environment. Then verify a real owner-provided key through the existing no-inference checker without logging it. Test rollback before any live change.

Hosted ChatGPT sign-in is a separate integration requiring a participating OAuth client and per-user sessions. In the interim, this private hosted preview must not accept shared-state ChatGPT sign-in or token callbacks. The local client may continue using its separate sign-in path.
