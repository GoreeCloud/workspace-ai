#!/usr/bin/env bash
set -euo pipefail
if [[ "${GITHUB_ACTIONS:-}" != "true" || -z "${GITHUB_RUN_ID:-}" ]]; then
  echo "This QA is for disposable GitHub Actions only"
  exit 1
fi
project="gc-provider-qa-${GITHUB_RUN_ID}"
compose=(docker compose -p "$project" -f deploy/private-dev/compose.yaml -f deploy/private-dev/compose.provider-egress.yaml)
cleanup() { "${compose[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT
"${compose[@]}" config --quiet
"${compose[@]}" up --build -d --wait --wait-timeout 180
app="$("${compose[@]}" ps -q workspace-ai)"
proxy="$("${compose[@]}" ps -q provider-proxy)"
[[ -n "$app" && -n "$proxy" ]] || exit 1
[[ -z "$(docker port "$app")" && -z "$(docker port "$proxy")" ]] || exit 1
docker exec "$app" node --input-type=module -e '
import assert from "node:assert/strict"
assert.equal(process.env.NODE_USE_ENV_PROXY,"1")
assert.equal(process.env.HTTPS_PROXY,"http://provider-proxy:3128")
const r=await fetch("https://api.openai.com/v1/models",{signal:AbortSignal.timeout(15000)})
assert.equal(r.status,401)
console.log("PASS: authenticated HTTPS path for unauthenticated model-list request")
'
echo "PASS: no published backend or proxy ports"
docker exec "$app" node --input-type=module -e '
import net from "node:net"
const result=await new Promise((resolve,reject)=>{
 const s=net.connect(3128,"provider-proxy")
 let text=""
 s.setTimeout(5000,()=>s.destroy(Error("timeout")))
 s.once("connect",()=>s.write("CONNECT example.com:443 HTTP/1.1\r\nHost: example.com:443\r\n\r\n"))
 s.on("data",b=>{text+=b.toString();if(text.includes("\r\n\r\n")){s.destroy();resolve(text)}})
 s.on("error",reject)
})
if(!result.startsWith("HTTP/1.1 403"))process.exit(1)
'
