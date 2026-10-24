#!/usr/bin/env bash
# Read-only acceptance of the ACTUAL protected Workspace AI private-development
# containers. Unlike private-dev-runtime-check.sh, this is not a pre-ingress
# synthetic smoke check and never prints an owner/gateway credential.
set -euo pipefail

backend="goreecloud-workspace-ai-private-dev-workspace-ai-1"
gateway="caddy"
host="workspace-ai-dev.goreecloud.com"
smoke_net="goreecloud-workspace-ai-private-dev_private_smoke"
ingress_net="goreecloud-workspace-ai-private-ingress"

fail() { printf 'FAIL protected runtime: %s\n' "$1" >&2; exit 1; }
for tool in docker curl jq; do
  command -v "$tool" >/dev/null || fail "missing required tool: $tool"
done

test "$(docker inspect "$backend" --format '{{.State.Status}}')" = running || fail 'backend is not running'
test "$(docker inspect "$backend" --format '{{.State.Health.Status}}')" = healthy || fail 'backend health is not healthy'
test "$(docker inspect "$backend" --format '{{.Config.User}}')" = '1000:1000' || fail 'unexpected backend user'
test "$(docker inspect "$backend" --format '{{.HostConfig.ReadonlyRootfs}}')" = true || fail 'backend root filesystem is writable'
test "$(docker inspect "$backend" --format '{{json .HostConfig.PortBindings}}')" = '{}' || fail 'backend publishes host ports'
test -z "$(docker port "$backend")" || fail 'backend publishes Docker ports'

docker inspect "$backend" --format '{{json .HostConfig.CapDrop}}' |
  jq -e 'index("ALL") != null' >/dev/null || fail 'backend does not drop capabilities'
docker inspect "$backend" --format '{{json .HostConfig.SecurityOpt}}' |
  jq -e 'index("no-new-privileges:true") != null' >/dev/null || fail 'backend allows privilege escalation'

# Inspect only the required flag and the *presence* of a file path. Never
# display environment contents, which could accidentally include secrets.
backend_env="$(docker inspect "$backend" --format '{{range .Config.Env}}{{println .}}{{end}}')"
printf '%s\n' "$backend_env" | grep -Fxq 'WORKSPACE_AI_PRIVATE_DEV_GATEWAY_REQUIRED=true' || fail 'backend gateway guard is disabled'
printf '%s\n' "$backend_env" | grep -Eq '^WORKSPACE_AI_PRIVATE_DEV_GATEWAY_TOKEN_FILE=/' || fail 'backend file-backed peer secret is not configured'
unset backend_env

docker inspect "$backend" --format '{{json .NetworkSettings.Networks}}' |
  jq -e --arg smoke "$smoke_net" --arg ingress "$ingress_net" 'keys | sort == ([$smoke,$ingress] | sort)' >/dev/null || fail 'unexpected backend network attachment'
for network in "$smoke_net" "$ingress_net"; do
  test "$(docker network inspect "$network" --format '{{.Internal}}')" = true || fail "network $network permits external egress"
  test "$(docker network inspect "$network" --format '{{.Attachable}}')" = false || fail "network $network allows ad hoc attachment"
done
echo 'PASS protected backend healthy, least-privilege and isolated on two internal networks'

test "$(docker inspect "$gateway" --format '{{.State.Status}}')" = running || fail 'shared Caddy is not running'
docker inspect "$gateway" --format '{{json .NetworkSettings.Networks}}' |
  jq -e --arg ingress "$ingress_net" 'has("proxy") and has($ingress)' >/dev/null || fail 'Caddy is not on proxy and restricted ingress networks'
echo 'PASS shared Caddy connected to restricted private ingress'

# Negative probes are intentionally unauthenticated, credential-free and have
# no body. A positive owner login and recovery require separate acceptance.
for mode in missing wrong; do
  if test "$mode" = wrong; then
    code="$(docker exec "$gateway" curl --silent --show-error --output /dev/null \
      --connect-timeout 3 --max-time 8 --header "Host: $host" \
      --header 'X-GoreeCloud-Gateway-Version: 1' \
      --header 'X-GoreeCloud-Gateway-Token: deliberately-invalid-qa-token' \
      --write-out '%{http_code}' http://workspace-ai-private-dev:3031/api/status)" || fail 'backend wrong-token request failed'
  else
    code="$(docker exec "$gateway" curl --silent --show-error --output /dev/null \
      --connect-timeout 3 --max-time 8 --header "Host: $host" \
      --write-out '%{http_code}' http://workspace-ai-private-dev:3031/api/status)" || fail 'backend no-token request failed'
  fi
  test "$code" = 403 || fail "backend $mode-token request returned HTTP $code, expected 403"
  echo "PASS backend $mode peer-token request denied (HTTP 403)"
done

bridge="$(curl --silent --show-error --output /dev/null \
  --connect-timeout 3 --max-time 10 --resolve "$host:443:127.0.0.1" \
  --write-out '%{http_code} %{ssl_verify_result}' "https://$host/api/status")" || fail 'non-NetBird HTTPS probe failed'
test "$bridge" = '403 0' || fail 'non-NetBird source was not denied over trusted HTTPS'
echo 'PASS non-NetBird Caddy request denied (HTTP 403, TLS verified)'
echo 'PASS protected private-development runtime negative-path acceptance'
echo 'NOTE: owner-authenticated browser, VPN interruption, peer rotation, provider egress/account isolation and real restore remain separate gates'
