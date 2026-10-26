#!/usr/bin/env bash
# Read-only preflight for the LIVE-shared Caddyfile plus REVIEW-ONLY development route.
# Uses synthetic environment values, an ephemeral Docker container with no network,
# and never replaces/reloads the active Caddyfile or requests certificates.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_config="${GOREECLOUD_CADDYFILE_SOURCE:-/srv/docker/caddy/Caddyfile}"
image="${GOREECLOUD_CADDY_IMAGE:-goreecloud/caddy:2.11.4-porkbun-v0.3.1}"
test -r "$source_config" || { echo "FAIL: active Caddyfile is not readable" >&2; exit 1; }
test -r "$root/deploy/private-dev/Caddyfile.private.example"
if grep -Fq 'workspace-ai-dev.goreecloud.com' "$source_config"; then
  echo "STOP: active Caddyfile already contains the development hostname; review before regenerating" >&2
  exit 1
fi

work="$(mktemp -d "${TMPDIR:-/tmp}/goreecloud-workspace-ai-caddy-qa.XXXXXXXX")"
chmod 700 "$work"
cleanup() {
  # Only remove the exact ephemeral mktemp directory created above.
  case "$work" in
    "${TMPDIR:-/tmp}"/goreecloud-workspace-ai-caddy-qa.????????) rm -rf -- "$work" ;;
    *) echo "WARNING: refusing cleanup of an unexpected path" >&2 ;;
  esac
}
trap cleanup EXIT
mkdir -m 700 "$work/data" "$work/config"
cat "$source_config" > "$work/Caddyfile"
printf '\n# PRIVATE DEVELOPMENT PREVIEW ONLY — never auto-deploy\n' >> "$work/Caddyfile"
cat "$root/deploy/private-dev/Caddyfile.private.example" >> "$work/Caddyfile"
chmod 600 "$work/Caddyfile"

# The password is a hardcoded NON-LIVE validation fixture, never an owner login.
# Use the exact custom Caddy image with the installed Porkbun provider plugin.
hash="$(docker run --rm --network none "$image" caddy hash-password --plaintext 'synthetic-preflight-validation-not-an-owner-password')"
test -n "$hash"
{
  printf 'PORKBUN_API_KEY=VALIDATION_ONLY_NOT_A_REAL_KEY\n'
  printf 'PORKBUN_API_SECRET_KEY=VALIDATION_ONLY_NOT_A_REAL_SECRET\n'
  printf 'WORKSPACE_AI_DEV_BCRYPT_HASH=%s\n' "$hash"
  printf 'WORKSPACE_AI_DEV_GATEWAY_TOKEN=%s\n' "$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
} > "$work/validation.env"
chmod 600 "$work/validation.env"

if ! docker run --rm --network none --read-only \
  --user "$(id -u):$(id -g)" --cap-drop ALL --cap-add NET_BIND_SERVICE \
  --tmpfs /tmp:rw,nosuid,nodev,size=8m \
  --env-file "$work/validation.env" \
  --mount "type=bind,src=$work/Caddyfile,dst=/etc/caddy/Caddyfile,readonly" \
  --mount "type=bind,src=$work/data,dst=/data" \
  --mount "type=bind,src=$work/config,dst=/config" \
  "$image" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile > "$work/validation.log" 2>&1; then
  tail -n 12 "$work/validation.log" >&2
  echo "FAIL: combined Caddy development candidate did not validate" >&2
  exit 1
fi
grep -q 'Valid configuration' "$work/validation.log"
echo "PASS: combined Caddyfile validates using exact custom image and non-live credential fixtures"
echo "PASS: no live Caddy changes, reload, public port publication or network access"
echo "NOTE: certificate issuance, owner authentication, active routing and rollback remain unverified"
