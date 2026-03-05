#!/usr/bin/env bash
# Usage:
#   BACKUP_DIR=/var/backups/db scripts/backup.sh
#   DB_BACKUP_RETENTION_DAYS=30 scripts/backup.sh
#   crontab -e -> 0 * * * * /path/to/scripts/backup.sh >> /var/log/jiesong-backup.log 2>&1
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

BACKUP_DIR="${DB_BACKUP_DIR:-$REPO_ROOT/backups/db}"
BACKUP_PREFIX="${DB_BACKUP_PREFIX:-db_backup}"
ENV_FILE="${DB_BACKUP_ENV_FILE:-$REPO_ROOT/.env}"
LOG_FILE="${DB_BACKUP_LOG_FILE:-$REPO_ROOT/logs/backup.log}"
RETENTION_DAYS="${DB_BACKUP_RETENTION_DAYS:-14}"
TIMESTAMP="$(date -u +'%Y%m%d_%H%M%S')"

mkdir -p "$BACKUP_DIR"
mkdir -p "$(dirname "$LOG_FILE")"
chmod 700 "$BACKUP_DIR"

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

resolve_database_url() {
  if [[ -n "${DATABASE_URL:-}" ]]; then
    echo "$DATABASE_URL"
    return
  fi

  if [[ -n "${DATABASE_URL_FILE:-}" && -f "${DATABASE_URL_FILE:-}" ]]; then
    # shellcheck disable=SC1091
    . "$DATABASE_URL_FILE"
    if [[ -n "${DATABASE_URL:-}" ]]; then
      echo "$DATABASE_URL"
      return
    fi
  fi

  echo "file:$REPO_ROOT/backend/dev.db"
}

sqlite_backup() {
  local database_url="$1"
  local db_file="${database_url#file:}"

  if [[ "$db_file" != /* ]]; then
    db_file="$REPO_ROOT/$db_file"
  fi

  if [[ ! -f "$db_file" ]]; then
    log_msg "ERROR" "SQLite 数据库文件不存在: $db_file"
    exit 1
  fi

  local raw_file="$BACKUP_DIR/${BACKUP_PREFIX}_${TIMESTAMP}.sqlite3"
  local gzip_file="${raw_file}.gz"

  cp -- "$db_file" "$raw_file"
  gzip -9 "$raw_file"
  checksum_file "$gzip_file" > "${gzip_file}.sha256"
  log_msg "INFO" "SQLite 备份完成: $gzip_file"
}

postgres_backup() {
  local database_url="$1"
  local raw_file="$BACKUP_DIR/${BACKUP_PREFIX}_${TIMESTAMP}.sql"

  if ! command -v pg_dump >/dev/null 2>&1; then
    log_msg "ERROR" "未安装 pg_dump，无法备份 PostgreSQL"
    exit 1
  fi

  pg_dump \
    --no-owner \
    --no-privileges \
    "$database_url" > "${raw_file}"

  gzip -9 "$raw_file"
  checksum_file "${raw_file}.gz" > "${raw_file}.gz.sha256"
  log_msg "INFO" "PostgreSQL 备份完成: ${raw_file}.gz"
}

cleanup_old_backups() {
  if [[ "$RETENTION_DAYS" == "0" ]]; then
    return
  fi

  find "$BACKUP_DIR" -name "${BACKUP_PREFIX}_*.*" -type f -mtime "+$RETENTION_DAYS" -exec rm -f {} +
}

main() {
  local database_url
  database_url="$(resolve_database_url)"

  case "$database_url" in
    file:*)
      sqlite_backup "$database_url"
      ;;
    postgres://*|postgresql://*)
      postgres_backup "$database_url"
      ;;
    *)
      log_msg "ERROR" "不支持的数据库 URL: $database_url"
      exit 1
      ;;
  esac

  cleanup_old_backups
}

main "$@"
checksum_file() {
  local file_path="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file_path" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$file_path" | awk '{print $1}'
  else
    echo "N/A"
  fi
}
