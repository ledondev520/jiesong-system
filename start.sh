#!/usr/bin/env bash
# 捷淞系统本地启动兼容入口。权威实现位于 scripts/start-local.sh：
# frontend=3000，backend=3001。保留本文件仅兼容历史使用习惯。

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec "$PROJECT_DIR/scripts/start-local.sh" "$@"
