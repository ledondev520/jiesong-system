# Source before any deployment npm/npx/node command; provision the runtime separately.
# An absolute, single PATH entry keeps the selection valid across deployment cd steps.
NODE_RUNTIME=${NODE_RUNTIME:-/opt/jiesong_system/runtime/node-v22.23.4-linux-x64}
case "$NODE_RUNTIME" in
  /*) ;;
  *) echo 'Deploy runtime error: NODE_RUNTIME must be an absolute directory' >&2; exit 1 ;;
esac
case "$NODE_RUNTIME" in
  *:*) echo 'Deploy runtime error: NODE_RUNTIME must not contain a PATH separator' >&2; exit 1 ;;
esac
if [ ! -x "$NODE_RUNTIME/bin/node" ]; then
  echo 'Deploy runtime error: NODE_RUNTIME/bin/node is missing or not executable' >&2
  exit 1
fi
export NODE_RUNTIME
export PATH="$NODE_RUNTIME/bin:$PATH"
hash -r
if [ "$(command -v node)" != "$NODE_RUNTIME/bin/node" ]; then
  echo 'Deploy runtime error: node does not resolve to NODE_RUNTIME/bin/node' >&2
  exit 1
fi
if ! node -e 'const version = process.versions.node; const [major, minor, patch] = version.split(".").map(Number); process.exit(/^\d+\.\d+\.\d+$/.test(version) && (major > 22 || (major === 22 && (minor > 23 || (minor === 23 && patch >= 4)))) ? 0 : 1)'; then
  echo 'Deploy runtime error: dedicated Node.js must be >=22.23.4 and runnable' >&2
  exit 1
fi
