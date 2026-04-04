#!/bin/bash
#
# start-local.sh — 本地前后端一键启动（固定端口，避免冲突）
# 用法: ./scripts/start-local.sh [--stop]
#

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"

# 固定端口：backend 3001，frontend 3000（与 next.config.ts 默认代理保持一致）
export BACKEND_PORT=3001
export FRONTEND_PORT=3000

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()  { echo -e "${BLUE}[INFO]${NC} $1"; }
log_ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_err()   { echo -e "${RED}[ERR]${NC} $1"; }

stop_port() {
  local port=$1
  local pids
  pids=$(lsof -ti:"$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    log_info "释放端口 $port ..."
    echo "$pids" | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
}

start_backend() {
  log_info "启动后端 (PORT=$BACKEND_PORT) ..."
  cd "$BACKEND_DIR"
  if [ ! -d "node_modules" ]; then
    log_warn "后端缺少 node_modules，正在安装 ..."
    npm install
  fi
  nohup env PORT="$BACKEND_PORT" npm run dev > "$PROJECT_DIR/logs/backend-dev.log" 2>&1 &
  local pid=$!
  log_ok "后端 PID: $pid"

  # 等待可用
  for i in {1..15}; do
    if curl -s "http://localhost:$BACKEND_PORT/api/v1/health" > /dev/null 2>&1; then
      log_ok "后端已就绪: http://localhost:$BACKEND_PORT"
      return 0
    fi
    sleep 1
  done
  log_err "后端启动超时，请检查 logs/backend-dev.log"
  return 1
}

start_frontend() {
  log_info "启动前端 (PORT=$FRONTEND_PORT) ..."
  cd "$FRONTEND_DIR"
  if [ ! -d "node_modules" ]; then
    log_warn "前端缺少 node_modules，正在安装 ..."
    npm install
  fi
  nohup env PORT="$FRONTEND_PORT" npm run dev > "$PROJECT_DIR/logs/frontend-dev.log" 2>&1 &
  local pid=$!
  log_ok "前端 PID: $pid"

  for i in {1..20}; do
    if curl -s -o /dev/null -w "%{http_code}" "http://localhost:$FRONTEND_PORT" | grep -qE "200|307"; then
      log_ok "前端已就绪: http://localhost:$FRONTEND_PORT"
      return 0
    fi
    sleep 1
  done
  log_err "前端启动超时，请检查 logs/frontend-dev.log"
  return 1
}

stop_all() {
  log_info "停止本地服务 ..."
  stop_port "$BACKEND_PORT"
  stop_port "$FRONTEND_PORT"
  log_ok "已停止"
}

show_status() {
  echo ""
  echo "=========================================="
  echo -e "  捷淞进销存 - 本地开发环境"
  echo "=========================================="
  echo -e "  前端: ${GREEN}http://localhost:$FRONTEND_PORT${NC}"
  echo -e "  后端: ${GREEN}http://localhost:$BACKEND_PORT${NC}"
  echo "=========================================="
  echo -e "  停止命令: ${YELLOW}./scripts/start-local.sh --stop${NC}"
  echo ""
}

main() {
  mkdir -p "$PROJECT_DIR/logs"

  case "${1:-}" in
    --stop)
      stop_all
      ;;
    *)
      stop_all
      sleep 1
      start_backend
      start_frontend
      show_status
      ;;
  esac
}

main "$@"
