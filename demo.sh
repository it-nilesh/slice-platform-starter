#!/usr/bin/env bash
# Guided demo: independent microfrontends + microservices behind one gateway.
#
#   ./demo.sh                     interactive (press Enter between steps)
#   DEMO_AUTO=1 ./demo.sh         run straight through (e.g. for recording)
#   GATEWAY_PORT=8088 ./demo.sh   if port 8080 is taken
set -euo pipefail
cd "$(dirname "$0")"

export GATEWAY_PORT="${GATEWAY_PORT:-8080}"
URL="http://localhost:${GATEWAY_PORT}"
MANIFEST=gateway/config/mfe-manifest.json

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
dim() { printf '\033[2m%s\033[0m\n' "$*"; }
step() { printf '\n\033[1;36m━━ %s\033[0m\n' "$*"; }
run() { dim "\$ $*"; "$@"; }
pause() {
  if [ "${DEMO_AUTO:-0}" = "1" ]; then return; fi
  printf '\033[2m%s\033[0m' "${1:-Press Enter to continue…}"
  read -r _
}
wait_for() {
  local url=$1 tries=60
  until curl -fsS -o /dev/null "$url"; do
    tries=$((tries - 1))
    if [ "$tries" -eq 0 ]; then echo "Timed out waiting for $url" >&2; exit 1; fi
    sleep 2
  done
}
# Sets "enabled" on one manifest entry, editing the file in place (it is bind-mounted into the gateway).
set_enabled() {
  node -e '
    const fs = require("fs");
    const [file, name, enabled] = process.argv.slice(1);
    const m = JSON.parse(fs.readFileSync(file, "utf8"));
    const r = m.remotes.find((x) => x.name === name);
    if (enabled === "true") delete r.enabled; else r.enabled = false;
    fs.writeFileSync(file, JSON.stringify(m, null, 2) + "\n");
  ' "$MANIFEST" "$1" "$2"
}
shell_identity() { docker inspect -f '{{slice .Image 7 19}} started {{.State.StartedAt}}' "$(docker compose ps -q shell)"; }

for cmd in docker node curl; do
  command -v "$cmd" >/dev/null || { echo "Missing prerequisite: $cmd" >&2; exit 1; }
done

step "1. Start the platform (gateway, shell, 3 slices)"
run docker compose up -d --build
wait_for "$URL/healthz"
wait_for "$URL/config/mfe-manifest.json"
bold "Open $URL: add products in Catalog, place an order in Orders, edit Profile."
pause

step "2. The shell knows nothing at build time: it reads this manifest at runtime"
run curl -s "$URL/config/mfe-manifest.json"
echo
pause

step "3. Every request is checked by the services, not trusted from the browser"
dim "Try to buy the 449.99 monitor for 0.01: the price is ignored and taken from catalog-api."
run curl -s -X POST "$URL/api/orders" -H 'Content-Type: application/json' \
  -d '{"customerEmail":"demo@example.com","lines":[{"productId":"0b4f7c3e-1d2a-4c55-9a51-6f8f2a1d0003","quantity":1,"unitPrice":0.01}]}'
echo
pause

step "4. Kill switch: hide a slice by editing config only (no build, no deploy)"
SHELL_BEFORE=$(shell_identity)
dim "Setting \"enabled\": false for orders in $MANIFEST"
set_enabled orders false
bold "Reload $URL: Orders is gone from the navigation."
pause
set_enabled orders true
bold "Re-enabled. Reload again: Orders is back."
SHELL_AFTER=$(shell_identity)
if [ "$SHELL_BEFORE" = "$SHELL_AFTER" ]; then bold "✓ The shell was not rebuilt or restarted."; fi
pause

step "5. Fault isolation: one slice goes down, the rest keeps working"
run docker compose stop mfe-catalog
bold "Open $URL/catalog: Catalog shows 'unavailable'; Orders and Profile still work."
pause "Press Enter to bring Catalog back…"
run docker compose start mfe-catalog
bold "Click 'Try again' in the browser: Catalog recovers without a page reload."

step "Done"
bold "The platform keeps running at $URL (stop it with: docker compose down)."
