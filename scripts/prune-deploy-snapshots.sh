#!/usr/bin/env bash
# Keeps the newest 12 auto-premigrate-* snapshot dirs under <backup-root>; manual pre-* backups never match.
# Assumes GNU coreutils. Orders by the UTC timestamp in the name, because copies and restores change mtimes.
set -euo pipefail
export LC_ALL=C
KEEP=12
root=${1:?usage: prune-deploy-snapshots.sh <backup-root>}
if [ ! -d "$root" ]; then
  echo "snapshot prune: not a directory: $root" >&2
  exit 2
fi

names=()
for path in "$root"/auto-premigrate-*; do
  name=${path##*/}
  if [ -d "$path" ] && [ ! -L "$path" ] && [[ $name =~ ^auto-premigrate-[A-Za-z0-9-]{7}-[0-9]{8}T[0-9]{6}Z$ ]]; then
    names+=("$name")
  fi
done
[ "${#names[@]}" -gt "$KEEP" ] || exit 0

printf '%s\n' "${names[@]}" | sed -E 's/.*-([0-9]{8}T[0-9]{6}Z)$/\1 &/' | sort -r | tail -n +"$((KEEP + 1))" | cut -d' ' -f2 |
  while IFS= read -r name; do
    rm -rf -- "${root:?}/$name"
    echo "snapshot prune: removed $name"
  done
