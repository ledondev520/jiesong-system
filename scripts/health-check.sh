#!/usr/bin/env bash
# Usage:
#   HEALTH_CHECK_URL=http://127.0.0.1:3000/health scripts/health-check.sh
#   HEALTH_REQUIRE_DB_CHECK=0 scripts/health-check.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

LOG_FILE="${HEALTH_LOG_FILE:-$REPO_ROOT/logs/health-check.log}"
ENV_FILE="${HEALTH_ENV_FILE:-$REPO_ROOT/.env}"
PORT="${PORT:-3000}"
TIMEOUT_SECONDS="${HEALTH_CHECK_TIMEOUT:-5}"
URL="${HEALTH_CHECK_URL:-http://127.0.0.1:${PORT}/health}"
DISK_THRESHOLD="${HEALTH_DISK_THRESHOLD:-85}"
REQUIRE_DB_CHECK="${HEALTH_REQUIRE_DB_CHECK:-1}"

mkdir -p "$(dirname "$LOG_FILE")"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a
  # shellcheck disable=SC1091
  . "$ENV_FILE"
  set +a
fi

log_msg() {
  local level="$1"
  local message="$2"
  local timestamp
  timestamp="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
  echo "${timestamp} [${level}] ${message}" | tee -a "$LOG_FILE"
}

log_kv() {
  local status="$1"
  local check="$2"
  local detail="$3"
  log_msg "$status" "${check}: ${detail}"
}

resolve_db_file() {
  local database_url="${DATABASE_URL:-}"
  if [[ "$database_url" == file:* ]]; then
    local db_file="${database_url#file:}"
    if [[ "$db_file" = /* ]]; then
      echo "$db_file"
    else
      echo "$REPO_ROOT/$db_file"
    fi
    return 0
  fi

  return 1
}

check_http_health() {
  local response_file
  response_file="$(mktemp)"
  local code
  code="$(curl -sS -m "$TIMEOUT_SECONDS" -w '%{http_code}' -o "$response_file" "$URL" || true)"
  if [[ "$code" != "200" ]]; then
    rm -f "$response_file"
    return 1
  fi

  if ! grep -q '"status"[[:space:]]*:[[:space:]]*"ok"' "$response_file" \
    && ! grep -q '"status":[[:space:]]*\"ok\"' "$response_file"; then
    rm -f "$response_file"
    return 1
  fi

  rm -f "$response_file"
  return 0
}

check_database() {
  local database_url="${DATABASE_URL:-}"
  if [[ -z "$database_url" ]]; then
    return 2
  fi

  case "$database_url" in
    file:*)
      local db_file
      db_file="$(resolve_db_file)"
      if [[ ! -f "$db_file" ]]; then
        return 1
      fi
      if [[ ! -r "$db_file" || ! -w "$db_file" ]]; then
        return 1
      fi
      return 0
      ;;
    postgres://*|postgresql://*)
      if ! command -v pg_isready >/dev/null 2>&1; then
        return 2
      fi
      if ! pg_isready -d "$database_url" >/dev/null 2>&1; then
        return 1
      fi
      return 0
      ;;
    *)
      return 2
      ;;
  esac
}

check_disk() {
  local usage
  usage="$(df -P "$REPO_ROOT" | tail -n 1 | awk '{print $5}' | tr -dc '0-9')"
  if [[ -z "$usage" ]]; then
    return 2
  fi
  if (( usage >= DISK_THRESHOLD )); then
    return 1
  fi
  return 0
}

status="PASS"

if check_http_health; then
  log_kv "OK" "HTTP" "服务健康检查通过 ${URL}"
else
  log_kv "ERROR" "HTTP" "服务健康检查失败 ${URL}"
  status="FAIL"
fi

if check_disk; then
  log_kv "OK" "DISK" "磁盘使用率正常 (阈值 ${DISK_THRESHOLD}%)"
else
  disk_status=$?
  if [[ "$disk_status" == "2" ]]; then
    log_kv "WARN" "DISK" "无法解析磁盘使用率，已跳过"
  else
    log_kv "ERROR" "DISK" "磁盘使用率超过阈值 ${DISK_THRESHOLD}%"
    status="FAIL"
  fi
fi

if [[ "$REQUIRE_DB_CHECK" != "0" ]]; then
  if check_database; then
    log_kv "OK" "DATABASE" "数据库可用"
  else
    db_status=$?
    if [[ "$db_status" == "2" ]]; then
      log_kv "WARN" "DATABASE" "数据库类型未识别或缺少检测工具，已跳过"
    else
      log_kv "ERROR" "DATABASE" "数据库检查失败"
      status="FAIL"
    fi
  fi
else
  log_kv "INFO" "DATABASE" "DATABASE 检查已禁用"
fi

if [[ "$status" == "PASS" ]]; then
  log_msg "PASS" "overall=PASS"
  exit 0
fi

log_msg "FAIL" "overall=FAIL"
exit 1
