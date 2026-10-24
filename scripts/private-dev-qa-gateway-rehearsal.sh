#!/usr/bin/env bash
# One-shot, temporary, isolated HTTPS/Caddy authentication rehearsal.
# NEVER modifies the shared Caddyfile or publishes a host port.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
network="goreecloud-workspace-ai-private-ingress"
image="${GOREECLOUD_CADDY_IMAGE:-goreecloud/caddy:2.11.4-porkbun-v0.3.1}"
test "$(docker network inspect "$network" --format '{{.Internal}}')" = true
test "$(docker inspect goreecloud-workspace-ai-private-dev-workspace-ai-1 --format '{{.State.Health.Status}}')" = healthy
test "$(docker inspect goreecloud-workspace-ai-private-dev-workspace-ai-1 --format '{{json .HostConfig.PortBindings}}')" = '{}'

work="$(mktemp -d "${TMPDIR:-/tmp}/goreecloud-workspace-ai-qa-rehearsal.XXXXXXXX")"
name="goreecloud-workspace-ai-qa-rehearsal-$$"
cleanup() {
  docker rm -f "$name" >/dev/null 2>&1 || true
  case "$work" in
    "${TMPDIR:-/tmp}"/goreecloud-workspace-ai-qa-rehearsal.????????) rm -rf -- "$work" ;;
    *) echo "WARNING: unexpected QA directory; refusing cleanup" >&2 ;;
  esac
}
trap cleanup EXIT
chmod 700 "$work"
mkdir -m 700 "$work/data" "$work/config"
python3 - "$work" <<'PY'
from pathlib import Path
import bcrypt,os,re,secrets,stat,sys
folder=Path(sys.argv[1])
password=secrets.token_urlsafe(32)
digest=bcrypt.hashpw(password.encode(),bcrypt.gensalt(rounds=12)).decode()
outside=os.environ.get("WORKSPACE_AI_QA_GATEWAY_TOKEN_FILE")
if outside:
    source=Path(outside)
    metadata=source.stat()
    if not stat.S_ISREG(metadata.st_mode) or metadata.st_mode & 0o077:
        raise SystemExit("Refusing unrestricted QA gateway token source")
    token=source.read_text().strip()
    if not re.fullmatch(r"[a-fA-F0-9]{64}",token):
        raise SystemExit("Invalid synthetic QA gateway token")
else:
    token=secrets.token_hex(32)
envcontent="WORKSPACE_AI_SYNTHETIC_BCRYPT_HASH="+digest+"\nWORKSPACE_AI_SYNTHETIC_GATEWAY_TOKEN="+token+"\n"
for filename,content in (("test-password",password+"\n"),("qa.env",envcontent)):
    fd=os.open(folder/filename,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w') as stream: stream.write(content)
PY

docker run -d --name "$name" \
  --user "$(id -u):$(id -g)" \
  --network "$network" --network-alias workspace-ai-qa-rehearsal \
  --read-only --cap-drop ALL --cap-add NET_BIND_SERVICE \
  --security-opt no-new-privileges:true \
  --tmpfs /tmp:rw,nosuid,nodev,size=8m \
  --env-file "$work/qa.env" \
  -v "$root/deploy/private-dev/Caddyfile.synthetic-qa:/etc/caddy/Caddyfile:ro" \
  -v "$work/data:/data" -v "$work/config:/config" \
  "$image" >/dev/null

ready=false
for attempt in $(seq 1 50); do
  if test -s "$work/data/caddy/pki/authorities/local/root.crt"; then ready=true; break; fi
  if test "$(docker inspect "$name" --format '{{.State.Status}}')" != running; then
    echo "FAIL: synthetic Caddy gateway stopped before TLS became ready" >&2
    exit 1
  fi
  sleep 0.2
done
test "$ready" = true || { echo "FAIL: synthetic gateway CA not ready" >&2; exit 1; }
WORKSPACE_AI_QA_DIR="$work" WORKSPACE_AI_QA_GATEWAY_CONTAINER="$name" \
  bash "$root/scripts/private-dev-qa-gateway-check.sh"
echo "PASS: one-shot isolated Caddy rehearsal finished; credentials and QA container will be removed"
