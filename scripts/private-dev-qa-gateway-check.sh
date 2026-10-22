#!/usr/bin/env bash
# Synthetic QA gateway acceptance — must run on an authorized private VPS host.
# No public ports, production secrets, or actual user accounts are required.
# Reads a temporary, locally provisioned password; does not print credentials.
set -euo pipefail

qa="${WORKSPACE_AI_QA_DIR:-$HOME/workspace-ai-private-gateway-qa}"
ca="$qa/data/caddy/pki/authorities/local/root.crt"
gateway="${WORKSPACE_AI_QA_GATEWAY_CONTAINER:-goreecloud-workspace-ai-caddy-qa}"
test -s "$ca"
test -s "$qa/test-password"
test "$(docker inspect "$gateway" --format '{{.State.Status}}')" = running
test "$(docker inspect "$gateway" --format '{{json .HostConfig.PortBindings}}')" = '{}'
test "$(docker inspect "$gateway" --format '{{.HostConfig.ReadonlyRootfs}}')" = true

ip="$(docker inspect "$gateway" --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')"
test -n "$ip"
url="https://workspace-ai-dev.goreecloud.com/api/status"
args=(--silent --show-error --cacert "$ca" --resolve "workspace-ai-dev.goreecloud.com:443:$ip" --max-time 10 --output /dev/null)
unauth="$(curl "${args[@]}" --write-out '%{http_code} %{ssl_verify_result}' "$url")"
test "$unauth" = '401 0'
echo "PASS synthetic HTTPS unauthenticated denial: $unauth"

# Authentication must cover browser pages and OAuth setup, not only status APIs.
for protected_path in / /api/auth/start /api/models; do
  denied="$(curl "${args[@]}" --write-out '%{http_code} %{ssl_verify_result}' "https://workspace-ai-dev.goreecloud.com$protected_path")"
  test "$denied" = '401 0' || { echo "FAIL unauthenticated route gate: $protected_path" >&2; exit 1; }
  echo "PASS unauthenticated route gate: $protected_path"
done

wrong="$(curl "${args[@]}" --user 'synthetic-qa:incorrect-qa-only' --write-out '%{http_code} %{ssl_verify_result}' "$url")"
test "$wrong" = '401 0'
echo "PASS synthetic HTTPS wrong credential denial: $wrong"

password="$(cat "$qa/test-password")"
request_with_auth() {
  printf 'user = "synthetic-qa:%s"\n' "$password" | curl "${args[@]}" --config - "$@"
}
success="$(request_with_auth --write-out '%{http_code} %{ssl_verify_result}' "$url")"
test "$success" = '200 0'
echo "PASS synthetic HTTPS owner test credential accepted: $success"

origin="$(request_with_auth -X POST -H 'Origin: https://untrusted.invalid' --write-out '%{http_code}' 'https://workspace-ai-dev.goreecloud.com/api/chat')"
test "$origin" = '403'
echo "PASS synthetic HTTPS invalid Origin rejected: $origin"
missing="$(request_with_auth -X POST --write-out '%{http_code}' 'https://workspace-ai-dev.goreecloud.com/api/chat')"
test "$missing" = '403'
echo "PASS synthetic HTTPS missing Origin rejected: $missing"
echo 'PASS all isolated QA HTTPS and credential-gate checks'
