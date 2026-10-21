# Workspace AI — private development hostname

**Target:** `https://workspace-ai-dev.goreecloud.com`
**Scope:** development only; not a production deployment, an independently authenticated multi-user service, or a native operating-system application.

## Verified baseline (October 21, 2026)

- The authorized laptop private DNS resolves this hostname to the VPS private NetBird address.
- HTTPS currently fails at the TLS handshake; Caddy has no Workspace AI host block.
- The existing default app is intentionally localhost-only; its Host/Origin checks and OAuth callback cannot be safely bypassed by a simple proxy header rewrite.
- No VPS Workspace AI service or container was identified during the October 21 inspection.
- Other Caddy virtual hosts on the VPS are shared infrastructure. Do not edit/reload shared ingress to test this change before reviewing its effect on the existing routes.

## Exact opt-in application configuration

The default still binds to `127.0.0.1` and accepts the loopback Host and authorized local origins only. To *test* the private development HTTPS origin without opening the network socket:

```sh
WORKSPACE_AI_PRIVATE_DEV_ENABLED=true \
WORKSPACE_AI_PRIVATE_DEV_ORIGIN=https://workspace-ai-dev.goreecloud.com \
WORKSPACE_AI_PORT=3031 npm start
```

In private development mode, the backend accepts only `Host: workspace-ai-dev.goreecloud.com`; unsafe HTTP methods require the exact `Origin: https://workspace-ai-dev.goreecloud.com`. OAuth callbacks and browser redirects use that HTTPS origin, so the external OAuth redirect URI must be explicitly registered and validated before a login test.

Only after verifying a dedicated isolated container/network that cannot be accessed from the internet, opt into its non-loopback *container* listener with both additional variables:

```sh
WORKSPACE_AI_PRIVATE_DEV_BIND_ALL=true
WORKSPACE_AI_PRIVATE_DEV_ISOLATED_CONTAINER=true
```

Never publish container port 3031 to a public host address, use `--network host`, or treat the self-declared isolation variable as a substitute for checking Docker port mappings, firewall rules, and network membership. Keep profiles, credentials, storage, and test fixtures independent from production.

## Isolated Docker smoke environment (source and CI validated)

The reviewed development branch includes `deploy/private-dev/Dockerfile` and `deploy/private-dev/compose.yaml`. The Compose project uses an **internal Docker network, no published host ports, an unprivileged runtime user, no credentials, read-only root filesystem and ephemeral storage**. It is intentionally **not connected to the shared Caddy proxy**, so it cannot make the HTTPS hostname available by itself.

To run a synthetic, unauthenticated backend smoke test on an explicitly authorized development host, from a clean checkout at the verified PR commit:

```sh
docker compose -f deploy/private-dev/compose.yaml config --quiet
docker compose -f deploy/private-dev/compose.yaml up --build -d --wait --wait-timeout 180
docker compose -f deploy/private-dev/compose.yaml ps
docker compose -f deploy/private-dev/compose.yaml down --remove-orphans
```

Before and after deployment, inspect `docker port <container-id>` (must be empty), `docker inspect` for `ReadonlyRootfs=true`, internal network ownership/membership, and absence of production storage mounts. **Do not insert API keys, OAuth tokens, user data, a persistent browser profile, or Caddy connectivity into this smoke environment.** Its HTTP healthcheck is container-internal and verifies only that the synthetic backend starts.

GitHub Actions includes an independent Docker Compose smoke job that builds the image, checks health, verifies **no published port**, tests a valid Host and denial of invalid Host/Origin, and removes resources afterward. CI is not evidence of VPS deployment, NetBird ingress, certificate trust, browser UX, or owner-specific authentication.

## Mandatory ingress gates before a Caddy change

1. Preserve the private/split-horizon DNS rewrite. Do not create a public A/AAAA record for this hostname.
2. Establish an independently verifiable HTTPS certificate using an approved DNS-01 flow or another reviewed trust arrangement. Do not disable certificate verification.
3. Configure a **dedicated hostname route**, owner-specific authenticated access, and NetBird source filtering. Deny non-NetBird and unauthenticated clients with no upstream access. Restrict backend access to a dedicated private Docker network shared only with the proxy.
4. Never forward an arbitrary public Host/Origin or rewrite an untrusted Origin to one that passes the backend check. Preserve the original approved Host and HTTPS Origin.
5. Validate the full Caddy config and test existing sites *before* any scoped reload; have the previous config and a reversible rollback command ready. Shared ingress changes are **not** part of this source pull request.
6. Use an empty development account profile and synthetic data. Do not provide API/OAuth credentials until hostname, TLS, access control, and session separation have been verified.
7. Do not treat VPN membership alone as application-level user authentication or tenant isolation. The current backend has a single local credential/profile store and has not been qualified for multi-user hosting.

## Acceptance checks

From an authorized NetBird laptop:

```sh
getent ahostsv4 workspace-ai-dev.goreecloud.com
curl -I --max-time 10 https://workspace-ai-dev.goreecloud.com/
curl -i --max-time 10 https://workspace-ai-dev.goreecloud.com/api/status
```

The repository also provides a read-only, credential-free acceptance probe. Run it on an authorized NetBird workstation after certificate and gateway configuration:

```sh
node scripts/private-dev-ingress-check.mjs
```

It fails closed if DNS does not resolve exclusively to the private NetBird IPv4 range, if TLS is not trusted, or if unauthenticated access to the homepage or account status is permitted. It never bypasses TLS verification, supplies credentials, or treats gateway denial as proof of authenticated functionality.

For an ingress that requires authentication, unauthenticated responses should be 401/403 and must not disclose application content or account status. After authenticating to the approved ingress, `/api/status` should return 200 with `Cache-Control: no-store` and the expected content-security policy.

Also verify blocked/non-NetBird clients, invalid/missing Origin on unsafe methods, mismatched Host, browser navigation, relevant mobile viewport, OAuth redirects *only after registration*, DNS/tunnel disconnects, reload/rollback, and logs that do not expose private data. `npm run check` and `node --test tests/private-dev-origin.test.mjs` verify source behavior, not live tunnel security.

## Status and recovery

**Implemented in source branch:** opt-in strict development origin, backend Host/Origin enforcement, localhost default and regression tests.

**Not deployed:** DNS is owner-reported and independently resolved on the authorized laptop, but HTTPS ingress, dedicated backend container, auth-gated routing, end-to-end browser testing, and platform-native applications remain outstanding.

**Rollback:** Disable all `WORKSPACE_AI_PRIVATE_DEV_*` variables to restore the default loopback-only backend, then stop the isolated dev container. Roll back any future approved ingress change using its separately captured pre-change Caddy config; do not modify other Caddy site blocks.
