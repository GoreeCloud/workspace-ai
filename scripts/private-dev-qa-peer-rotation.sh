#!/usr/bin/env bash
# CI-only synthetic gateway/backend token rotation. Never invoke on the shared VPS.
# The backend and gateway are isolated, have no published host ports, and use no
# actual user/provider credentials. No token value is sent to a log or client.
set -euo pipefail

test "${GITHUB_ACTIONS:-}" = true || { echo 'FAIL: synthetic rotation is GitHub CI-only' >&2; exit 1; }
test -n "${RUNNER_TEMP:-}" || { echo 'FAIL: missing disposable runner directory' >&2; exit 1; }
test -n "${WORKSPACE_AI_QA_BACKEND_TOKEN_FILE:-}" || exit 1
test -n "${WORKSPACE_AI_QA_GATEWAY_TOKEN_FILE:-}" || exit 1
test "$(docker network inspect goreecloud-workspace-ai-private-ingress --format '{{.Internal}}')" = true
test "$(docker inspect goreecloud-workspace-ai-private-dev-workspace-ai-1 --format '{{json .HostConfig.PortBindings}}')" = '{}'
test "$(docker inspect goreecloud-workspace-ai-private-dev-workspace-ai-1 --format '{{.HostConfig.ReadonlyRootfs}}')" = true

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work="$(mktemp -d "$RUNNER_TEMP/workspace-ai-synthetic-rotation.XXXXXXXX")"
chmod 700 "$work"
backend_file="$WORKSPACE_AI_QA_BACKEND_TOKEN_FILE"
gateway_file="$WORKSPACE_AI_QA_GATEWAY_TOKEN_FILE"
rotated=false
cleanup() {
  # Keep fixtures matched in failure paths; the parent workflow always tears
  # down both disposable services and removes their credential mounts.
  if test "$rotated" = true && test -s "$work/next.token"; then
    install -m 0600 "$work/next.token" "$gateway_file" || true
  fi
  rm -f -- "$work/previous.token" "$work/peer.token" "$work/next.token"
  rmdir -- "$work" 2>/dev/null || true
}
trap cleanup EXIT

test -s "$backend_file"
test -s "$gateway_file"
cp -- "$gateway_file" "$work/previous.token"
chmod 600 "$work/previous.token"
openssl rand -hex 32 > "$work/next.token"
chmod 600 "$work/next.token"
test "$(wc -c < "$work/next.token")" -eq 65
if cmp -s "$work/previous.token" "$work/next.token"; then
  echo 'FAIL: synthetic rotation did not change credential' >&2
  exit 1
fi

# The backend reads its token once on startup. The old gateway credential
# must fail after the *backend* rotates, even though Caddy Basic Auth passes.
sudo install -o 1000 -g 1000 -m 0600 "$work/next.token" "$backend_file"
rotated=true
docker compose -f "$root/deploy/private-dev/compose.yaml" \
  -f "$root/deploy/private-dev/compose.ingress.yaml" \
  -f "$root/deploy/private-dev/compose.gateway-auth-qa.yaml" \
  up --no-build --detach --force-recreate --wait --wait-timeout 180
test "$(docker inspect goreecloud-workspace-ai-private-dev-workspace-ai-1 --format '{{.State.Health.Status}}')" = healthy
test "$(docker inspect goreecloud-workspace-ai-private-dev-workspace-ai-1 --format '{{json .HostConfig.PortBindings}}')" = '{}'
WORKSPACE_AI_QA_EXPECT_UPSTREAM_STATUS=403 bash "$root/scripts/private-dev-qa-gateway-rehearsal.sh"
echo 'PASS: previously configured synthetic gateway peer denied after backend rotation'

# A direct Docker peer presenting the revoked token must also be rejected.
cp -- "$work/previous.token" "$work/peer.token"
sudo chown 1000:1000 "$work/peer.token"
docker run --rm --pull never --user 1000:1000 \
  --network goreecloud-workspace-ai-private-ingress \
  --cap-drop ALL --security-opt no-new-privileges:true \
  --mount "type=bind,source=$work/peer.token,target=/run/previous.token,readonly" \
  goreecloud-workspace-ai-private-dev:local node -e '
    const fs=require("node:fs");
    const http=require("node:http");
    const credential=fs.readFileSync("/run/previous.token","utf8").trim();
    if(!/^[a-fA-F0-9]{64}$/.test(credential))throw Error("Invalid disposable QA fixture");
    const request=http.get({hostname:"workspace-ai-private-dev",port:3031,
      path:"/api/status",timeout:5000,headers:{
        Host:"workspace-ai-dev.goreecloud.com",
        "X-GoreeCloud-Gateway-Version":"1",
        "X-GoreeCloud-Gateway-Token":credential
      }},res=>{res.resume();res.on("end",()=>{
        if(res.statusCode!==403){console.error("FAIL: stale peer unexpectedly accepted");process.exitCode=1}
        else console.log("PASS: revoked direct Docker peer credential denied")
      })});
    request.on("error",error=>{console.error(error.message);process.exitCode=1});
    request.on("timeout",()=>request.destroy(Error("timeout")));
  '

# Updating only the authorized upstream fixture restores successful TLS and
# authenticated proxy access; forged client headers remain ineffective.
install -m 0600 "$work/next.token" "$gateway_file"
bash "$root/scripts/private-dev-qa-gateway-rehearsal.sh"
echo 'PASS: synchronized synthetic gateway/backend credential accepted'

# Roll back a deliberately stale *gateway-side* configuration, then recover
# the known-good NEW token without re-authorizing the revoked old token.
install -m 0600 "$work/previous.token" "$gateway_file"
WORKSPACE_AI_QA_EXPECT_UPSTREAM_STATUS=403 bash "$root/scripts/private-dev-qa-gateway-rehearsal.sh"
install -m 0600 "$work/next.token" "$gateway_file"
bash "$root/scripts/private-dev-qa-gateway-rehearsal.sh"

test "$(docker network inspect goreecloud-workspace-ai-private-ingress --format '{{len .Containers}}')" = 1
test -z "$(docker ps --all --format '{{.Names}}' | grep '^goreecloud-workspace-ai-qa-rehearsal-' || true)"
echo 'PASS: disposable rotation, stale gateway rollback denial, recovery and QA gateway cleanup'
