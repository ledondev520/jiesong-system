#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
export HOME="$ROOT_DIR/state/byterover-home"

mkdir -p \
  "$HOME" \
  "$HOME/Library/Application Support" \
  "$HOME/Library/Logs"

if [ "${1-}" = "curate" ]; then
  exec python3 "$ROOT_DIR/scripts/brv_local_curate.py" "$@"
fi

if ! command -v brv >/dev/null 2>&1; then
  echo "brv is not available in PATH. Install fallback with: npm install -g byterover-cli" >&2
  exit 127
fi

if [ "${1-}" = "query" ]; then
  if output="$(brv "$@" 2>&1)"; then
    case "$output" in
      *"No provider connected"*)
        printf '%s\n' "Provider-backed query unavailable; falling back to local ByteRover search." >&2
        shift
        exec brv search "$*" --limit 8
        ;;
    esac
    printf '%s\n' "$output"
    exit 0
  fi

  case "$output" in
    *"No provider connected"*)
      printf '%s\n' "Provider-backed query unavailable; falling back to local ByteRover search." >&2
      shift
      exec brv search "$*" --limit 8
      ;;
  esac

  printf '%s\n' "$output" >&2
  exit 1
fi

exec brv "$@"
