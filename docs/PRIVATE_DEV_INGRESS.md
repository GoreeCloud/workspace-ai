# Workspace AI — private development hostname

**Target:** `https://workspace-ai-dev.goreecloud.com`
**Scope:** development only; not a production deployment, an independently authenticated multi-user service, or a native operating-system application.

## Verified baseline (October 21, 2026)

- The authorized laptop private DNS resolves this hostname to the VPS private NetBird address.
- HTTPS currently fails at the TLS handshake; Caddy has no Workspace AI host block.
- The existing default app is intentionally localhost-only; its Host/Origin checks and OAuth callback cannot be safely bypassed by a simple proxy header rewrite.
- No VPS Workspace AI service was identified at the **initial** inspection; a separate, isolated synthetic development container was subsequently built and verified, as recorded below.
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

## Inactive private Caddy integration template

The repository includes an **unapplied** `deploy/private-dev/Caddyfile.private.example` with private NetBird source matching, an owner-specific Caddy Basic Authentication gate, DNS-01 TLS configuration, and a default 403. It deliberately strips the gateway's `Authorization` and `Proxy-Authorization` headers before proxying to the backend. Do not store plaintext or hashed owner passwords in GitHub; provision a separate development-only bcrypt hash through a restricted environment variable after the host's Caddy version, DNS provider configuration, and secret delivery are reviewed.

`deploy/private-dev/compose.ingress.yaml` is also **unapplied**. It requires a separately provisioned internal Docker network named `goreecloud-workspace-ai-private-ingress` that only the authorized Caddy reverse proxy and this development backend can reach. The base smoke Compose configuration does not attach Caddy and remains the default. No public port publishing, production application credentials, or shared Docker proxy-network attachment is authorized by these templates.

Before any live activation, capture the existing container/network topology, Caddyfile revision, certificate state, Caddy version/plugins and complete route snapshot; validate the proposed combined configuration using the exact existing Caddy binary and plugin set; confirm that owner-only authentication is active **before** attaching a reachable backend; rehearse restoring the previous Caddy configuration and Docker network connections in a permitted test target. A proxy reload and production/shared-container network mutation are separate risk-bearing operations and were not performed for this PR.

Caddy's Basic Authentication is a *temporary one-owner development gate*, not SSO, account isolation, or proof that the Workspace AI backend is safe for concurrent users. In particular, anyone with the gateway password would still share the backend's server-side account profile; continue using synthetic profiles and no API/OAuth credentials until proper per-user authorization and isolation are validated.

## Certificate privacy and trust decision

Private DNS does **not** imply an undiscoverable hostname. Issuing a publicly trusted, host-specific certificate through ACME DNS-01 may expose the development subdomain in public Certificate Transparency records; DNS-01 also uses public challenge TXT records even when no public A/AAAA record exists. If keeping the **hostname itself** confidential is required, review an appropriately managed wildcard certificate (only if the existing certificate and key lifecycle are suitable) or an internal CA before requesting a host-specific public certificate. Both approaches have different key-management risks.

Caddy supports an internal CA with `tls internal`, but authorized client devices must explicitly trust its root certificate; never distribute a root CA private key, turn off certificate verification, or use `curl -k` as a permanent workaround. This is a decision gate, not a change to the existing Caddyfile or its current certificate authority. See the [Caddy Automatic HTTPS documentation](https://caddyserver.com/docs/automatic-https) and [Caddy TLS directive](https://caddyserver.com/docs/caddyfile/directives/tls).

## Outbound API access is intentionally absent

The synthetic smoke container's `internal: true` Docker network intentionally has **no external route**. That protects the isolated development fixture, but also prevents Workspace AI from contacting ChatGPT OAuth, model APIs, remote MCP providers and other external integrations. A healthy `/api/status` response is **not proof that AI chat works**. The optional private ingress override only supplies another explicitly restricted network; it does not grant provider egress.

For real private AI chat testing, first design a separate reviewable outbound policy with explicit destination rules, redirect/DNS-rebinding and SSRF safeguards, credential handling, denial logging and revocation behavior. Do not join the backend to a shared unrestricted network or enable host networking as a shortcut. Then test provider access with an approved test account, measure results independently, and preserve account isolation. See [Docker's internal network semantics](https://docs.docker.com/compose/how-tos/networking/#internal-networks).

## Direct backend access and credential boundaries (unresolved)

**Critical deployment distinction:** Caddy Basic Authentication protects requests *through Caddy*, but the backend currently authenticates no upstream Docker peer. Its Host/Origin middleware rejects malformed browser requests but is **not a substitute for user or service authentication**. Any process with permission to attach to the isolated ingress Docker network may be able to contact port 3031 directly, provide the expected Host/Origin, and reach backend endpoints without the Caddy password. This is a narrower threat model than public internet access, but it is still an access-control gap.

Before making the private ingress live, require a defense-in-depth backend-to-gateway authentication contract (for example, an explicitly configured file-backed high-entropy secret validated at the backend on every request), with confidential provisioning to both services, constant-time comparison, rotation/revocation, fail-closed startup, and tests proving direct Docker-network requests are denied. Docker daemon administrators retain privileged access; this defense must not be represented as protection from the Docker host administrator. Also independently verify real NetBird peer IP visibility at Caddy: a Docker bridge, NAT or another proxy may change the observed source address, so the proposed `remote_ip 100.64.0.0/10` check must not be assumed effective without an authenticated remote-client test.

The synthetic HTTPS QA workflow exercises the Caddy path but does **not** establish this backend peer-authentication contract, tenant isolation, or live network perimeter. Retain the PR as draft, keep test accounts synthetic, and leave shared ingress inactive until the gap is closed and verified.

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

## Verified isolated VPS smoke (October 21, 2026)

The isolated synthetic development backend was **built and launched on `goreecloud-vps-01`** from source commit `deda6ca275bd9c8eadf054a1b3320eb14b68eb07` in a separate development checkout. The Docker backend became healthy, recovered to healthy after a controlled development-only container restart, retained a read-only root and empty port bindings, and remained on its internal private smoke network. The actual backend returned HTTP 200 for the approved host and HTTP 403 for invalid Host and unauthorized/missing Origin cases.

`bash scripts/private-dev-runtime-check.sh` was then executed on the VPS against the running development container from script commit `ff609faad7b00b8da2ad22e1ccfcf18987e667d2`, returning **PASS** for runtime isolation, empty credentials/account state, and all four HTTP cases. The same script is also invoked during the isolated GitHub Actions Docker CI job.

To revalidate an existing isolated development deployment without mutating containers or proxy settings:

```sh
cd /path/to/verified/workspace-ai-development-checkout
bash scripts/private-dev-runtime-check.sh
```

The script refuses missing/unhealthy containers, public port bindings, writable root filesystems, unexpected/noninternal networks, nonempty account credentials, or incorrect HTTP denial behavior. It does **not** verify the private hostname's TLS, Caddy login, browser operation, DNS split-horizon behavior, AI API egress, model responses, real user accounts or native applications.

**Live private HTTPS ingress remains pending.** No shared Caddyfile rewrite/reload, public DNS mutation, private proxy network membership change, or credentials provisioning was performed as part of this VPS smoke run. A later ingress deployment needs its own snapshot, isolated network checks, authenticated-user testing, TLS chain verification, and rollback evidence.

## Verified private-network and synthetic HTTPS gateway QA (October 21, 2026)

The VPS now has a separately created **internal** Docker network named `goreecloud-workspace-ai-private-ingress`. The healthy, synthetic Workspace AI container is attached to that network and its original internal smoke network. It still has a read-only root and **no published host ports**. The existing shared Caddy service is attached only to its original `proxy` network; no shared Caddy configuration or DNS rewrite was changed.

For certificate and authentication testing only, a second Caddy container named `goreecloud-workspace-ai-caddy-qa` was launched **without host port mappings** on the isolated network. It loads `deploy/private-dev/Caddyfile.synthetic-qa`, using an internal CA and a temporary, randomly generated synthetic Basic Authentication password/hash kept in restricted files outside the repository. The QA client subnet `172.16.0.0/12` is an **internal Docker test matcher**, not a substitute for the NetBird `100.64.0.0/10` matcher required by the inactive live configuration example.

A private VPS-side TLS client used the temporary QA root certificate through `--cacert`, with the intended hostname and SNI via `--resolve`. The tests **did not disable TLS certificate verification**. Results from the isolated container:

| Check | Verified outcome |
| --- | --- |
| TLS chain against the temporary QA root | Trusted (`ssl_verify_result=0`) |
| No authentication | HTTP 401 |
| Wrong synthetic authentication | HTTP 401 |
| Correct synthetic authentication | HTTP 200 |
| Correct authentication with untrusted Origin on POST | HTTP 403 |
| Correct authentication with missing Origin on POST | HTTP 403 |

The executable check was preserved at `scripts/private-dev-qa-gateway-check.sh` with no password embedded in source control. Run it only on a host with the explicitly provisioned local QA credential and CA files. This is **not** the actual NetBird-accessible HTTPS hostname. It does not validate a publicly trusted certificate, owner-supplied credentials, remote NetBird authorization, browser login, external model calls, or multi-user authorization.

For future QA runs, always match the Caddy QA container user/group to the host's owner of the restricted QA data directory; otherwise certificate-authority creation may fail with `permission denied`. Keep the QA CA private key and synthetic password restricted to temporary local files. Destroy QA-specific containers, network attachments, keys and test credentials once they are no longer needed, without touching the shared Caddy container, production secrets, or unrelated network state.

## Verified non-mutating Caddy preflight and self-cleaning rehearsal

The full VPS Caddyfile (existing sites plus the *proposed* development route) was copied into a restricted temporary candidate and validated with the **exact custom Caddy image** `goreecloud/caddy:2.11.4-porkbun-v0.3.1`. The validation container used **no network**, dummy DNS API environment variables, and a synthetic bcrypt password. Result: `Valid configuration`. This proves Caddy syntax and module compatibility only; it neither provisions real credentials/certificates nor reloads or updates live Caddy.

```sh
bash scripts/private-dev-caddy-preflight.sh
```

The test procedure is also packaged as a one-shot private gateway rehearsal, which generates fresh synthetic credentials in a restricted temporary directory, starts a separate **no-host-port** Caddy test container on the existing internal development network, verifies TLS/authentication/Origin behavior, and cleans up its QA container, temporary passwords and internal-CA material on exit.

```sh
bash scripts/private-dev-qa-gateway-rehearsal.sh
```

Both scripts **passed on the VPS**. After the dedicated rehearsal passed, the earlier manually created QA Caddy container and its synthetic credentials/certificate authority material were also removed. The private development backend remains running and isolated; the additional test gateway is no longer running. These scripts are not permission to activate or modify the shared Caddy service.

## Automated isolated HTTPS CI and pre-change rollback snapshot — October 21, 2026

The independent pull-request workflow `.github/workflows/private-dev-https-qa.yml` has been added to draft PR #66. GitHub Actions run **39690742815** passed on commit `50b9b8151ebf2246ff306a25e557ffdd593985fa` and independently verified disposable HTTPS gateway credentials, internal Docker networks, backend health and isolation, TLS chain validation, denial of missing/wrong authentication, and Origin protections, followed by cleanup. The existing `Checks` workflow also passed in run **39690742577** on that commit.

For shared-ingress recovery preparation, a restricted **pre-change snapshot** of the active VPS Caddyfile was created at `$HOME/workspace-ai-private-dev-snapshots/Caddyfile.before-workspace-ai-private-dev`. A byte-for-byte `cmp` verification against the active file succeeded immediately after capture. This snapshot is local to the authorized VPS and must not be committed, sent to public CI, or substituted for an actual restoration test. No active Caddy change or reload occurred, and access to the backup must remain restricted.

Prior to an authorized Caddy route activation, verify the backup's file permissions, test complete config validation using the same custom Caddy image and existing provider modules, document a scoped rollback procedure, and **test source-peer NetBird restrictions and real owner authentication**. The synthetic QA certificate/root CA and password are separate ephemeral test fixtures and are not valid owner credentials or a trusted live certificate.

## Status and recovery

**Implemented in source branch:** opt-in strict development origin, backend Host/Origin enforcement, localhost default and regression tests.

**Deployment status:** The dedicated synthetic backend and isolated HTTPS QA gateway have been exercised on the VPS. The **live** authenticated Caddy virtual host, owner credential, trusted remote HTTPS access, external provider egress, end-to-end browser acceptance, and genuine native applications remain outstanding.

**Rollback:** Disable all `WORKSPACE_AI_PRIVATE_DEV_*` variables to restore the default loopback-only backend, then stop the isolated dev container. Roll back any future approved ingress change using its separately captured pre-change Caddy config; do not modify other Caddy site blocks.

## Extended synthetic HTTPS route enforcement — October 21, 2026

The isolated QA script additionally checks that unauthenticated requests to the homepage, OAuth-start and models routes are denied at the TLS gateway, and that a same-origin POST to `/api/chat` without gateway authentication is denied before a backend handler can process it. These assertions are source changes on the development branch and must pass on that exact commit in GitHub Actions before they are treated as verified. They are **gateway-path tests**, not verification that direct Docker peer access is authenticated.
