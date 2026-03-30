#!/usr/bin/env bash
# Usage:
#   scripts/dev-cockpit-tunnel.sh
#   PORT=3001 scripts/dev-cockpit-tunnel.sh
#   DEV_COCKPIT_TUNNEL_URL=http://127.0.0.1:3000 scripts/dev-cockpit-tunnel.sh
set -euo pipefail

PORT="${PORT:-3000}"
LOCAL_URL="${DEV_COCKPIT_TUNNEL_URL:-http://127.0.0.1:${PORT}}"

echo "Starting quick tunnel for ${LOCAL_URL}"
echo "Keep the local frontend running, then open the printed public URL on your phone."

if command -v cloudflared >/dev/null 2>&1; then
  exec cloudflared tunnel --url "$LOCAL_URL"
fi

if command -v npx >/dev/null 2>&1; then
  exec npx --yes wrangler tunnel quick-start "$LOCAL_URL"
fi

echo "cloudflared or npx is required."
echo "Install cloudflared from Cloudflare docs, or install Node.js to use npx wrangler quick-start."
exit 1
