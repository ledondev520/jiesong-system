#!/bin/zsh
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export HOME="/Users/helena"

cd /Users/helena/Cursor/jiesong_system/backend

exec /opt/homebrew/bin/npm run dev
