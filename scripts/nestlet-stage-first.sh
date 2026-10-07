#!/usr/bin/env bash
# DRAFT: initial, owner-approved loopback staging only. No public ingress changes.
set -euo pipefail
umask 077
readonly SHA='8b42962e55305e3cc70b7c20ce5d7e4d74ed13c7'
readonly REPO='https://github.com/ledondev520/nestlet.git'
readonly BASE='/opt/nestlet'
readonly RELEASE="$BASE/releases/$SHA"
readonly ENVFILE="$BASE/shared/runtime.env"
readonly MARKER='nestlet-managed-stage-v1'
export DOCKER_HOST='unix:///var/run/docker.sock'
unset DOCKER_CONTEXT
fail() { printf 'Stage stopped: %s\n' "$1" >&2; exit 1; }
for command in git docker python3 ss df stat cmp; do command -v "$command" >/dev/null || fail "Required tool absent: $command"; done
docker compose version >/dev/null
docker info --format '{{.ServerVersion}}' >/dev/null
# This operation never creates or replaces credentials and never enables paid AI.
[ "$(df -Pk /opt | awk 'NR==2 {print $4}')" -ge 2097152 ] || fail 'At least 2 GiB free disk is required'
uid=$(id -u)
owned_directory() {
    [ -d "$1" ] && [ ! -L "$1" ] && [ "$(stat -c %u "$1")" = "$uid" ] || fail 'Unexpected directory ownership or symlink'
    [ "$(stat -c %a "$1")" = 700 ] || fail 'Expected private managed-directory permissions'
}
existing_containers=$(docker ps -aq --filter label=com.docker.compose.project=nestlet)
if [ -e "$BASE" ] || [ -L "$BASE" ]; then
    owned_directory "$BASE"
    [ -f "$BASE/.nestlet-managed" ] && [ ! -L "$BASE/.nestlet-managed" ] || fail 'Existing target has no ownership marker'
    [ "$(stat -c %u "$BASE/.nestlet-managed")" = "$uid" ] || fail 'Unexpected marker owner'
    [ "$(cat "$BASE/.nestlet-managed")" = "$MARKER" ] || fail 'Existing target marker does not match'
else
    [ -z "$existing_containers" ] || fail 'Existing Nestlet container without a managed directory'
    [ -z "$(ss -H -ltn 'sport = :4173')" ] || fail 'Port 4173 is already occupied'
    mkdir -m 700 "$BASE"
    printf '%s\n' "$MARKER" > "$BASE/.nestlet-managed"
fi
for directory in "$BASE/releases" "$BASE/shared"; do
    if [ ! -e "$directory" ] && [ ! -L "$directory" ]; then mkdir -m 700 "$directory"; fi
    owned_directory "$directory"
done
# Never overwrite a previously configured environment. A later operator setup
# intentionally makes this first-stage script inapplicable.
expected_env=$(mktemp)
trap 'rm -f "$expected_env"' EXIT
cat > "$expected_env" <<ENV
PUBLIC_ORIGIN=https://nestlet.celerada.link
NESTLET_IMAGE_TAG=$SHA
NESTLET_OPERATOR_PASSWORD_HASH=
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-flash
ENABLE_LIVE_AI=false
ENV
if [ -e "$ENVFILE" ] || [ -L "$ENVFILE" ]; then
    [ -f "$ENVFILE" ] && [ ! -L "$ENVFILE" ] && [ "$(stat -c %u "$ENVFILE")" = "$uid" ] && [ "$(stat -c %a "$ENVFILE")" = 600 ] || fail 'Unexpected runtime environment ownership or permissions'
    cmp -s "$expected_env" "$ENVFILE" || fail 'Existing runtime environment differs; left unchanged for review'
else
    (set -o noclobber; cat "$expected_env" > "$ENVFILE")
fi
if [ -e "$BASE/current" ] || [ -L "$BASE/current" ]; then
    [ -L "$BASE/current" ] && [ "$(readlink "$BASE/current")" = "$RELEASE" ] || fail 'A different release is already current; review an upgrade separately'
fi
if [ -e "$RELEASE" ] || [ -L "$RELEASE" ]; then
    owned_directory "$RELEASE"
    [ "$(git -C "$RELEASE" remote get-url origin)" = "$REPO" ] || fail 'Unexpected release origin'
    [ "$(git -C "$RELEASE" rev-parse HEAD)" = "$SHA" ] || fail 'Existing release is not the pinned commit'
    [ -z "$(git -C "$RELEASE" status --porcelain --untracked-files=all)" ] || fail 'Existing release contains modifications'
else
    git clone --quiet --no-checkout --filter=blob:none "$REPO" "$RELEASE"
    chmod 700 "$RELEASE"
    git -C "$RELEASE" fetch --quiet --depth=1 origin "$SHA"
    git -C "$RELEASE" checkout --quiet --detach "$SHA"
    [ "$(git -C "$RELEASE" rev-parse HEAD)" = "$SHA" ] || fail 'Pinned checkout verification failed'
fi
compose() {
    # Ignore inherited app env values, so this first stage cannot accidentally
    # import another service's credentials or enable live requests.
    env -u PUBLIC_ORIGIN -u NESTLET_IMAGE_TAG -u NESTLET_OPERATOR_PASSWORD_HASH \
        -u DEEPSEEK_API_KEY -u DEEPSEEK_MODEL -u ENABLE_LIVE_AI \
        docker compose --project-name nestlet --env-file "$ENVFILE" -f "$RELEASE/compose.yaml" "$@"
}
compose config --quiet
validate_container() {
    local id="$1"
    [ "$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$id")" = nestlet ] || fail 'Unexpected container project'
    [ "$(docker inspect --format '{{index .Config.Labels "com.docker.compose.service"}}' "$id")" = nestlet ] || fail 'Unexpected container service'
    [ "$(docker inspect --format '{{.Config.Image}}' "$id")" = "nestlet:$SHA" ] || fail 'Unexpected existing container image'
    [ "$(docker inspect --format '{{.HostConfig.ReadonlyRootfs}}' "$id")" = true ] || fail 'Container filesystem is not read-only'
    docker inspect --format '{{json .HostConfig.PortBindings}}' "$id" | python3 -c 'import json,sys; assert json.load(sys.stdin)=={"4173/tcp":[{"HostIp":"127.0.0.1","HostPort":"4173"}]}'
}
verify_http() {
    python3 - <<'PY'
import json, urllib.request, urllib.error
base='http://127.0.0.1:4173'
def request(path, method='GET'):
    req=urllib.request.Request(base+path, data=b'{}' if method=='POST' else None, method=method, headers={'Origin':'https://nestlet.celerada.link','Content-Type':'application/json'})
    try: response=urllib.request.urlopen(req,timeout=10)
    except urllib.error.HTTPError as error: response=error
    with response: return response.status,json.load(response)
code, body=request('/api/health'); assert code==200 and body=={'ok':True}
code, body=request('/api/status'); assert code==200
assert body['configured'] is False and body['authConfigured'] is False and body['liveEnabled'] is False
assert body['authenticated'] is False and 'csrfToken' not in body
assert body['pdfEnabled'] is True and body['workbookEnabled'] is True
for path,method,expected in [('/api/settings','GET','OPERATOR_SETUP_REQUIRED'),('/api/settings','POST','OPERATOR_SETUP_REQUIRED'),('/api/settings/test','POST','OPERATOR_SETUP_REQUIRED'),('/api/extract','POST','OPERATOR_SETUP_REQUIRED'),('/api/document','POST','OPERATOR_SETUP_REQUIRED'),('/api/workbook','POST','OPERATOR_SETUP_REQUIRED')]:
    code,body=request(path,method); assert code==503 and body.get('code')==expected, path
print('Health, parser availability, and unauthenticated fail-closed checks passed; no provider call made.')
PY
}
if [ -n "$existing_containers" ]; then
    [ "$(printf '%s\n' "$existing_containers" | wc -l)" -eq 1 ] || fail 'Unexpected multiple Nestlet containers'
    validate_container "$existing_containers"
    [ "$(docker inspect --format '{{.State.Status}}' "$existing_containers")" = running ] || fail 'Existing container is stopped; recovery needs separate review'
    [ "$(docker inspect --format '{{.State.Health.Status}}' "$existing_containers")" = healthy ] || fail 'Existing container is not healthy; recovery needs separate review'
    verify_http
    if [ ! -L "$BASE/current" ]; then ln -s "$RELEASE" "$BASE/current"; fi
    echo "Already staged and healthy at pinned commit $SHA; no rebuild or restart."
    exit 0
fi
[ -z "$(ss -H -ltn 'sport = :4173')" ] || fail 'Port 4173 became occupied; no existing service will be stopped'
compose build --pull
# The only started service is the independently named Nestlet Compose project.
compose up -d --no-build --wait --wait-timeout 90
container_id=$(compose ps -q nestlet)
[ -n "$container_id" ] || fail 'Nestlet container did not start'
validate_container "$container_id"
verify_http
if [ ! -L "$BASE/current" ]; then ln -s "$RELEASE" "$BASE/current"; fi
echo "Staged pinned commit $SHA on loopback only. TLS, operator setup, and live-provider verification remain incomplete."
echo 'Targeted rollback: stop only the nestlet service from this managed release; leave other projects and runtime.env untouched.'
