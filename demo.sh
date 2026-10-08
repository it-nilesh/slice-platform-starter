#!/usr/bin/env bash
# Guided demo: independent microfrontends + microservices behind one gateway.
#
#   ./demo.sh            interactive (press Enter between steps)
#   DEMO_AUTO=1 ./demo.sh   run straight through (e.g. for recording)
#   GATEWAY_PORT=8088 ./demo.sh   if port 8080 is taken
#
# The demo creates a temporary "inventory" slice and removes it again at the end.
set -euo pipefail
cd "$(dirname "$0")"

export GATEWAY_PORT="${GATEWAY_PORT:-8080}"
URL="http://localhost:${GATEWAY_PORT}"
SLICE="${DEMO_SLICE:-inventory}"

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
shell_identity() { docker inspect -f '{{slice .Image 7 19}} started {{.State.StartedAt}}' "$(docker compose ps -q shell)"; }

for cmd in docker node npm curl; do
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
run ./slice list
pause

step "3. Every request is checked by the services, not trusted from the browser"
dim "Try to buy the 449.99 monitor for 0.01: the price is ignored and taken from catalog-api."
run curl -s -X POST "$URL/api/orders" -H 'Content-Type: application/json' \
  -d '{"customerEmail":"demo@example.com","lines":[{"productId":"0b4f7c3e-1d2a-4c55-9a51-6f8f2a1d0003","quantity":1,"unitPrice":0.01}]}'
echo
pause

step "4. A new team ships a new slice: one command scaffolds API + MFE + CI pipeline"
SHELL_BEFORE=$(shell_identity)
run ./slice create "$SLICE" --label "Inventory"
pause

step "5. Deploy ONLY the new slice (nothing else is rebuilt or restarted)"
run docker compose up -d --build --no-deps "${SLICE}-api" "mfe-${SLICE}"
pause

step "6. Go live: register it at the gateway (manifest + allowlist, zero-downtime reload)"
run ./slice register "$SLICE" --reload
SHELL_AFTER=$(shell_identity)
bold "Reload $URL: \"Inventory\" is in the navigation."
echo "shell before: $SHELL_BEFORE"
echo "shell after:  $SHELL_AFTER"
if [ "$SHELL_BEFORE" = "$SHELL_AFTER" ]; then bold "✓ The shell was not rebuilt or restarted."; fi
pause

step "7. Kill switch: hide a broken slice without deploying anything"
run ./slice disable orders
bold "Reload $URL: Orders is gone from the navigation."
pause
run ./slice enable orders

step "8. Fault isolation: one slice goes down, the rest keeps working"
run docker compose stop mfe-catalog
bold "Open $URL/catalog: Catalog shows 'unavailable'; Orders and Profile still work."
pause "Press Enter to bring Catalog back…"
run docker compose start mfe-catalog
bold "Click 'Try again' in the browser: Catalog recovers without a page reload."
pause

step "9. Clean up the demo slice"
run docker compose rm -sf "${SLICE}-api" "mfe-${SLICE}"
run ./slice remove "$SLICE" --yes --reload
bold "Done. The platform keeps running at $URL (stop it with: docker compose down)."
