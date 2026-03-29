#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${JIESONG_BASE_URL:-}" ]]; then
  echo "JIESONG_BASE_URL is required"
  exit 1
fi

if [[ -z "${JIESONG_AGENT_TOKEN:-}" && ( -z "${JIESONG_USERNAME:-}" || -z "${JIESONG_PASSWORD:-}" ) ]]; then
  echo "Either JIESONG_AGENT_TOKEN or JIESONG_USERNAME + JIESONG_PASSWORD is required"
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required"
  exit 1
fi

INSTALL_DIR="${HOME}/.local/bin"
CONFIG_DIR="${HOME}/.config/jiesong-agent"
LAUNCHER="${INSTALL_DIR}/jiesong-agent-mcp"
CONFIG_FILE="${CONFIG_DIR}/config.env"

mkdir -p "${INSTALL_DIR}" "${CONFIG_DIR}"

if [[ -n "${JIESONG_AGENT_TOKEN:-}" ]]; then
  RESOLVED_TOKEN="${JIESONG_AGENT_TOKEN}"
else
  RESOLVED_TOKEN="$(python3 - <<'PYEOF'
import json
import os
import sys
import urllib.request

base_url = os.environ["JIESONG_BASE_URL"].rstrip("/")
username = os.environ["JIESONG_USERNAME"]
password = os.environ["JIESONG_PASSWORD"]

payload = json.dumps({
    "username": username,
    "password": password,
}).encode("utf-8")

req = urllib.request.Request(
    base_url + "/api/v1/auth/login",
    data=payload,
    headers={"Content-Type": "application/json"},
    method="POST",
)

try:
    with urllib.request.urlopen(req) as resp:
        body = json.loads(resp.read().decode("utf-8"))
        token = ((body or {}).get("data") or {}).get("token")
        if not token:
            raise RuntimeError("No token returned from login")
        print(token)
except Exception as exc:
    print(f"Failed to login: {exc}", file=sys.stderr)
    sys.exit(1)
PYEOF
)"
fi

cat > "${CONFIG_FILE}" <<EOF
JIESONG_BASE_URL=${JIESONG_BASE_URL}
JIESONG_AGENT_TOKEN=${RESOLVED_TOKEN}
EOF

cat > "${LAUNCHER}" <<'PYEOF'
#!/usr/bin/env python3
import json
import os
import sys
import urllib.request

config_file = os.path.expanduser("~/.config/jiesong-agent/config.env")
config = {}
if os.path.exists(config_file):
    with open(config_file, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            config[key.strip()] = value.strip()

base_url = os.environ.get("JIESONG_BASE_URL") or config.get("JIESONG_BASE_URL")
token = os.environ.get("JIESONG_AGENT_TOKEN") or config.get("JIESONG_AGENT_TOKEN")

if not base_url or not token:
    print("Missing JIESONG_BASE_URL or JIESONG_AGENT_TOKEN", file=sys.stderr)
    sys.exit(1)

endpoint = base_url.rstrip("/") + "/mcp"

for raw in sys.stdin:
    line = raw.strip()
    if not line:
        continue
    try:
        payload = line.encode("utf-8")
        req = urllib.request.Request(
            endpoint,
            data=payload,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {token}",
            },
            method="POST",
        )
        with urllib.request.urlopen(req) as resp:
            body = resp.read().decode("utf-8").strip()
            if body:
                print(body, flush=True)
    except Exception as exc:
        error_id = None
        try:
            parsed = json.loads(line)
            error_id = parsed.get("id")
        except Exception:
            error_id = None
        print(json.dumps({
            "jsonrpc": "2.0",
            "id": error_id,
            "error": {"code": -32000, "message": str(exc)},
        }), flush=True)
PYEOF

chmod +x "${LAUNCHER}"

echo "Installed ${LAUNCHER}"
echo "If ~/.local/bin is not in PATH, add this line:"
echo 'export PATH="$HOME/.local/bin:$PATH"'
echo "Quick test:"
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | "${LAUNCHER}"
