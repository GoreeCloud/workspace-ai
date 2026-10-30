# Workspace AI - private provider connectivity

Verified October 30, 2026: The optional restricted proxy passed isolated CI tests, but it remains disabled on the live VPS. The Workspace AI preview is healthy on image-only candidate 2da3dbc. A protected backend status check verified that no API key is configured. Hosted ChatGPT website sign-in is unavailable.

The default private Compose stack has internal-only Docker networks and no published application ports. The optional compose.provider-egress.yaml adds an outbound HTTPS CONNECT proxy. Only the proxy, never the app, joins the outbound bridge.

That proxy accepts only api.openai.com:443 and auth.openai.com:443, validates public DNS addresses, and pins the destination IP. CI confirmed uncredentialed OpenAI model-list reachability (HTTP 401), blocked an unrelated host, and found no published ports. This was a disposable QA environment, not proof of live network access or API key validity.

Workspace AI now reports whether the approved proxy is configured; it does not claim that a configured route has been tested. The private preview refuses key submission, verification, and model chat requests when outbound access is disabled. The local desktop client retains its separate connection behavior.

Remaining: validate the live permission change, strengthen per-user credential isolation, preserve and rehearse rollback, verify the live route and private HTTPS boundaries, and verify an owner-provided key without generating paid inference. Do not claim hosted OAuth or billable model inference is working before these gates are complete.
