#!/bin/bash
#
# start-local-with-tunnel.sh — 本地前后端 + Cloudflare Quick Tunnel 一键启动
# 完全免费，无需域名，无需 cloudflared 登录。
# Tunnel 地址会自动写到 ~/.jiesong-tunnel/url.txt
#

set -euo pipefail

# launchd 默认 PATH 不包含 Homebrew，显式加上
export PATH="/opt/homebrew/bin:$PATH"

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
TUNNEL_DIR="$HOME/.jiesong-tunnel"
TUNNEL_URL_FILE="$TUNNEL_DIR/url.txt"
LOG_DIR="$PROJECT_DIR/logs"

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

mkdir -p "$LOG_DIR" "$TUNNEL_DIR"

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
  nohup env PORT="$BACKEND_PORT" npm run dev > "$LOG_DIR/backend-dev.log" 2>&1 &
  local pid=$!
  for i in {1..20}; do
    if curl -s "http://localhost:$BACKEND_PORT/health" > /dev/null 2>&1; then
      log_ok "后端就绪: http://localhost:$BACKEND_PORT"
      return 0
    fi
    sleep 1
  done
  log_err "后端启动超时"
  return 1
}

start_frontend() {
  log_info "启动前端 (PORT=$FRONTEND_PORT) ..."
  cd "$FRONTEND_DIR"
  if [ ! -d "node_modules" ]; then
    log_warn "前端缺少 node_modules，正在安装 ..."
    npm install
  fi
  nohup env PORT="$FRONTEND_PORT" npm run dev > "$LOG_DIR/frontend-dev.log" 2>&1 &
  local pid=$!
  for i in {1..25}; do
    if curl -s -o /dev/null -w "%{http_code}" "http://localhost:$FRONTEND_PORT" | grep -qE "200|307"; then
      log_ok "前端就绪: http://localhost:$FRONTEND_PORT"
      return 0
    fi
    sleep 1
  done
  log_err "前端启动超时"
  return 1
}

start_tunnel() {
  log_info "启动 Cloudflare Quick Tunnel ..."
  local tunnel_log="$LOG_DIR/cloudflare-tunnel.log"
  : > "$tunnel_log"
  nohup cloudflared tunnel --url "http://localhost:$FRONTEND_PORT" > "$tunnel_log" 2>&1 &
  local pid=$!

  for i in {1..30}; do
    local url
    url=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$tunnel_log" | head -1 || true)
    if [ -n "$url" ]; then
      echo "$url" > "$TUNNEL_URL_FILE"
      # 同时也同步一份到项目根目录，方便在 Finder/项目里直接看到
      echo "$url" > "$PROJECT_DIR/TUNNEL_URL.txt"
      log_ok "Tunnel 就绪: $url"
      log_info "地址已保存到: $TUNNEL_URL_FILE"
      return 0
    fi
    sleep 1
  done
  log_err "Tunnel 启动超时"
  return 1
}

# 清理旧进程（只清理端口占用，不杀旧的 tunnel，避免 URL 抖动）
stop_port "$BACKEND_PORT"
stop_port "$FRONTEND_PORT"
sleep 1

# 启动链
start_backend
start_frontend
start_tunnel

echo ""
echo "=========================================="
echo -e "  捷淞进销存 - 本地开发环境 + 公网 tunnel"
echo "=========================================="
echo -e "  本地前端: ${GREEN}http://localhost:$FRONTEND_PORT${NC}"
echo -e "  本地后端: ${GREEN}http://localhost:$BACKEND_PORT${NC}"
echo -e "  公网地址: ${GREEN}$(cat "$TUNNEL_URL_FILE")${NC}"
echo "=========================================="
echo ""

# 进入守护循环，保持脚本不退出，防止 launchd KeepAlive 反复重启导致 URL 变化
while true; do
  sleep 30
done
