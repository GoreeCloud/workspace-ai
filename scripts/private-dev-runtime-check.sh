#!/usr/bin/env bash
# Synthetic-only VPS verification for the isolated Workspace AI development backend.
# This script is read-only: no container, network, user data or proxy modifications.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
compose=(docker compose -f deploy/private-dev/compose.yaml)
cid="$("${compose[@]}" ps -q workspace-ai)"
test -n "$cid" || { echo "FAIL: private development container is missing" >&2; exit 1; }

health="$(docker inspect "$cid" --format '{{.State.Health.Status}}')"
test "$health" = healthy || { echo "FAIL: private backend is not healthy" >&2; exit 1; }
test "$(docker inspect "$cid" --format '{{.HostConfig.ReadonlyRootfs}}')" = true || { echo "FAIL: writable container root" >&2; exit 1; }
test "$(docker inspect "$cid" --format '{{json .HostConfig.PortBindings}}')" = '{}' || { echo "FAIL: backend has published ports" >&2; exit 1; }
test -z "$(docker port "$cid")" || { echo "FAIL: backend has published ports" >&2; exit 1; }

net="goreecloud-workspace-ai-private-dev_private_smoke"
test "$(docker network inspect "$net" --format '{{.Internal}}')" = true || { echo "FAIL: smoke network permits external egress" >&2; exit 1; }

for network in $(docker inspect "$cid" --format '{{range $name,$_ := .NetworkSettings.Networks}}{{$name}} {{end}}'); do
  case "$network" in
    goreecloud-workspace-ai-private-dev_private_smoke|goreecloud-workspace-ai-private-ingress) ;;
    *) echo "FAIL: unexpected backend network membership" >&2; exit 1 ;;
  esac
  test "$(docker network inspect "$network" --format '{{.Internal}}')" = true || { echo "FAIL: network is not internal" >&2; exit 1; }
done

docker exec "$cid" node --input-type=module -e '
import http from "node:http";
const request = (host, method = "GET", origin, path = "/api/status") => new Promise((resolve, reject) => {
  const headers = {Host:host};
  if (origin !== undefined) headers.Origin = origin;
  const req = http.request({hostname:"127.0.0.1",port:3031,path,method,headers,timeout:4000}, res => {
    const parts = [];
    res.on("data", chunk => parts.push(chunk));
    res.on("end", () => resolve({status:res.statusCode,body:Buffer.concat(parts).toString("utf8")}));
  });
  req.once("timeout", () => req.destroy(new Error("backend request timed out")));
  req.once("error",reject);
  req.end();
});
const trusted = "workspace-ai-dev.goreecloud.com";
const cases = [
  ["approved host",trusted,"GET",undefined,"/api/status",200],
  ["incorrect host","127.0.0.1:3031","GET",undefined,"/api/status",403],
  ["unknown origin",trusted,"POST","https://untrusted.invalid","/api/chat",403],
  ["missing origin",trusted,"POST",undefined,"/api/chat",403]
];
for (const [name,host,method,origin,path,expected] of cases) {
  const {status,body} = await request(host,method,origin,path);
  if (status !== expected) throw new Error(name + ": expected HTTP "+ expected + ", received " + status);
  if (name === "approved host") {
    const data = JSON.parse(body);
    if (data.connected || data.apiConfigured || data.accounts?.length !== 0) throw new Error("synthetic backend unexpectedly has live credentials/accounts");
  }
  console.log("PASS "+name+" ("+status+")");
}
'
echo "PASS: private Workspace AI synthetic VPS runtime and isolation checks"
