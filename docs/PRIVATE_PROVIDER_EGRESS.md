# GoreeCloud Workspace AI: Private provider connectivity

**Status: restricted proxy and TLS SNI enforcement deployed on the private-development VPS on October 30, 2026; not production approved.**

The default Compose remains internal-only. The separately enabled provider overlay adds a restricted proxy reachable by Workspace AI on its existing internal network. Only the proxy joins a separate outbound bridge; the app retains its original two internal networks and publishes no ports.

The proxy permits HTTPS CONNECT only to `api.openai.com:443` and `auth.openai.com:443`, rejecting private and reserved DNS answers. It buffers the plaintext TLS ClientHello and requires its SNI to exactly match the approved CONNECT hostname before opening an outbound socket. Missing, mismatched, malformed, incomplete or oversized ClientHello handshakes fail closed. The application retains end-to-end TLS and certificate validation. The proxy cannot inspect encrypted HTTP Host or payloads without terminating TLS, which it deliberately does not do; shared-infrastructure domain-fronting remains a deployment threat-model consideration. No host port is published.

## Verified on October 30, 2026

- GitHub Actions: application tests/build, browser, private smoke, disposable egress, and isolated HTTPS gateway/rotation checks passed.
- Disposable VPS QA: OpenAI model-list request returned HTTP 401 without credentials, unapproved CONNECT returned HTTP 403, no published ports, and only proxy used outbound bridge. The QA stack was removed.
- Live configuration preflight accepted only the proxy service/network plus exact proxy environment and dependency; app image, network memberships, credential mounts and access controls were preserved.
- Live application and proxy report healthy; allowed catalog request returned HTTP 401 and blocked authority HTTP 403.
- The SNI-hardened proxy deployment changed only the provider-proxy image. The VPS image-only preflight verified image digests, unchanged app and network configuration, no published ports, unchanged app container identity and the preserved rollback image. The replacement proxy became healthy; an unauthenticated OpenAI model-list request returned HTTP 401, an unapproved CONNECT request returned HTTP 403, and private gateway/NetBird rejection checks passed. Automated regression tests also reject mismatched or missing TLS SNI before any outbound dial.
- Protected runtime denial checks and authorized NetBird HTTPS Basic Auth challenge passed.

## Remaining acceptance

An owner-provided API key still needs to be re-entered or verified in Settings through the read-only model catalog. Session keys do not persist through container restarts. Paid inference, authenticated browser acceptance and a full live rollback drill remain unverified.

Hosted ChatGPT sign-in requires a participating OAuth registration and isolated user sessions. API access and ChatGPT subscription allowance are separate.

## Recovery

The previous image remains available. Disable egress by using the existing protected base, ingress and peer-auth Compose files with the image-only candidate override, omitting the optional provider overlay. After protected runtime and trusted-HTTPS checks pass, remove only the unused proxy and network. The complete live rollback drill remains pending. Do not expand this private owner-gated service into a public or multi-tenant deployment without separate review.

## Connection readiness UX

The private preview reports `providerEgressStatus` as `configured` when the exact reviewed proxy environment is present or `disabled` otherwise. `configured` describes routing configuration, **not** credential verification or successful inference. While disabled, the app refuses new API key submissions, model-list checks, and API chats, and displays an actionable network explanation. Local client API connections retain their existing behavior. The currently deployed app image still uses a shared server-side API key. The updated source candidate provides short-lived, HttpOnly, browser-scoped credentials, but that change is not live until its own image-only deployment and two-browser HTTPS acceptance are verified. Browser cookies are not authenticated human identities; do not treat the private preview as approved for public or multi-user hosting.
