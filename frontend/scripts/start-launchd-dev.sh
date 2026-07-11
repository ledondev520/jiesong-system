#!/bin/zsh
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export HOME="/Users/helena"

readonly PROJECT_DIR="/Users/helena/Cursor/jiesong_system/frontend"
readonly MODE="${JIESONG_FRONTEND_MODE:-production}"
readonly NPM_BIN="/opt/homebrew/bin/npm"
readonly BUILD_MARKER=".next/BUILD_ID"

cd "$PROJECT_DIR"

if [[ "$MODE" == "development" || "$MODE" == "dev" ]]; then
  exec "$NPM_BIN" run dev
fi

if [[ "$MODE" != "production" && "$MODE" != "prod" ]]; then
  echo "[jiesong-frontend] 不支持的运行模式: $MODE" >&2
  exit 64
fi

needs_build=false
if [[ ! -f "$BUILD_MARKER" ]]; then
  needs_build=true
elif find src public \
  -type f \
  ! -name '*.test.*' \
  ! -name '*.spec.*' \
  ! -path 'src/test/*' \
  -newer "$BUILD_MARKER" \
  -print -quit 2>/dev/null | grep -q .; then
  needs_build=true
else
  for config_file in \
    package.json \
    package-lock.json \
    next.config.ts \
    tsconfig.json \
    postcss.config.mjs \
    middleware.ts \
    sentry.client.config.ts \
    sentry.edge.config.ts \
    sentry.server.config.ts; do
    if [[ -f "$config_file" && "$config_file" -nt "$BUILD_MARKER" ]]; then
      needs_build=true
      break
    fi
  done
fi

if [[ "$needs_build" == true ]]; then
  echo "[jiesong-frontend] 检测到构建缺失或源码更新，开始生产构建"
  "$NPM_BIN" run build
fi

echo "[jiesong-frontend] 以生产模式启动 http://localhost:3000"
exec "$NPM_BIN" run start
