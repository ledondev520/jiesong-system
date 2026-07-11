#!/bin/zsh
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export HOME="/Users/helena"

readonly PROJECT_DIR="/Users/helena/Cursor/jiesong_system/backend"
readonly MODE="${JIESONG_BACKEND_MODE:-production}"
readonly NPM_BIN="/opt/homebrew/bin/npm"

cd "$PROJECT_DIR"

if [[ "$MODE" == "development" || "$MODE" == "dev" ]]; then
  export NODE_ENV="development"
  echo "[jiesong-backend] 以开发模式启动 http://localhost:3001"
  exec "$NPM_BIN" run dev
fi

if [[ "$MODE" != "production" && "$MODE" != "prod" ]]; then
  echo "[jiesong-backend] 不支持的运行模式: $MODE" >&2
  exit 64
fi

export NODE_ENV="production"
export CORS_ORIGIN="${CORS_ORIGIN:-http://localhost:3000,http://127.0.0.1:3000}"
echo "[jiesong-backend] 以生产模式启动 http://localhost:3001"
exec "$NPM_BIN" run start
