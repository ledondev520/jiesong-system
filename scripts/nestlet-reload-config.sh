#!/usr/bin/env bash
# Reviewed-scope draft: SAME Nestlet release, existing configuration only.
# Run only after the operator setup helper has exited and the release lease is
# held. Never use concurrently with any environment writer or other deployment.
# No credential inspection, configuration edits, build, pull, migration or restore.
set -euo pipefail
umask 077
readonly SHA='2fc15f216714d0331a82456edb1d97b9f76f8498'
[[ "${1:-}" = "$SHA" && "${2:-}" = operator-setup-finished ]] || { echo 'Reload stopped: exact existing release and completed setup lease are required'; exit 1; }
readonly BASE='/opt/nestlet'
readonly ENVFILE="$BASE/shared/runtime.env"
readonly RELEASE="$BASE/releases/$SHA"
readonly DATA_VOLUME='nestlet_case_data'
readonly REPO='https://github.com/ledondev520/nestlet.git'
export DOCKER_HOST='unix:///var/run/docker.sock'
unset DOCKER_CONTEXT
fail() { printf 'Reload stopped: %s\n' "$1" >&2; exit 1; }
for name in git docker python3 stat flock; do command -v "$name" >/dev/null || fail "Missing tool: $name"; done
readonly uid="$(id -u)"
for directory in "$BASE" "$BASE/releases" "$BASE/shared" "$RELEASE"; do
    [ -d "$directory" ] && [ ! -L "$directory" ] && [ "$(stat -c %u "$directory")" = "$uid" ] && [ "$(stat -c %a "$directory")" = 700 ] || fail 'Unexpected managed directory'
done
[ -f "$BASE/.nestlet-managed" ] && [ ! -L "$BASE/.nestlet-managed" ] && [ "$(stat -c %u "$BASE/.nestlet-managed")" = "$uid" ] && [ "$(cat "$BASE/.nestlet-managed")" = nestlet-managed-stage-v1 ] || fail 'Ownership marker mismatch'
[ -L "$BASE/current" ] && [ "$(readlink "$BASE/current")" = "$RELEASE" ] || fail 'Current release differs from the approved same-release reload'
[ "$(git -C "$RELEASE" remote get-url origin)" = "$REPO" ] && [ "$(git -C "$RELEASE" rev-parse HEAD)" = "$SHA" ] && [ -z "$(git -C "$RELEASE" status --porcelain --untracked-files=all)" ] || fail 'Existing pinned release checkout has changed'
[ ! -L "$BASE/.incremental-release.lock" ] || fail 'Unsafe maintenance lock'
exec 9>"$BASE/.incremental-release.lock"
flock -n 9 || fail 'Another Nestlet maintenance operation holds the lease'
# Metadata only: never open, hash, copy, render or print the environment file.
env_metadata() {
    python3 - "$ENVFILE" <<'PY_META'
import os,stat,sys
try:
    s=os.lstat(sys.argv[1])
    assert stat.S_ISREG(s.st_mode) and s.st_uid==os.geteuid()
    assert stat.S_IMODE(s.st_mode)==0o600 and s.st_nlink==1
    print(s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns,s.st_ctime_ns,s.st_uid,s.st_gid,s.st_mode,s.st_nlink)
except Exception:
    sys.exit(1)
PY_META
}
readonly initial_metadata="$(env_metadata)"
[ -n "$initial_metadata" ] || fail 'Private configuration metadata is invalid'
check_lease() {
    [ "$(env_metadata)" = "$initial_metadata" ] || fail 'Configuration changed during maintenance; no values were inspected or rewritten'
    [ -L "$BASE/current" ] && [ "$(readlink "$BASE/current")" = "$RELEASE" ] || fail 'Current release changed during maintenance'
}
compose() {
    # Only Compose consumes the existing private environment to recreate its
    # already-authorized service. Never request rendered config or environment.
    env -u PUBLIC_ORIGIN -u NESTLET_OPERATOR_USERNAME -u NESTLET_OPERATOR_PASSWORD_HASH -u DEEPSEEK_API_KEY -u DEEPSEEK_MODEL -u ENABLE_LIVE_AI \
        NESTLET_IMAGE_TAG="$SHA" docker compose --project-name nestlet --env-file "$ENVFILE" -f "$RELEASE/compose.yaml" "$@" </dev/null
}
docker compose version >/dev/null 2>&1 || fail 'Docker Compose is unavailable'
docker info --format '{{.ServerVersion}}' >/dev/null 2>&1 || fail 'Docker daemon is unavailable'
# The immutable reviewed checkout supplies full Compose scope. These selectors
# return only non-secret service/volume/image names; suppress any parser errors.
[ "$(compose config --services 2>/dev/null)" = nestlet ] || fail 'Unexpected Compose services'
[ "$(compose config --volumes 2>/dev/null)" = case_data ] || fail 'Unexpected Compose volumes'
[ "$(compose config --images 2>/dev/null)" = "nestlet:$SHA" ] || fail 'Unexpected Compose image'
readonly IMAGE_ID="$(docker image inspect --format '{{.Id}}' "nestlet:$SHA")"
[[ "$IMAGE_ID" =~ ^sha256:[a-f0-9]{64}$ ]] || fail 'Invalid existing image identity'
check_runtime() {
    local id
    id=$(docker ps -aq --filter label=com.docker.compose.project=nestlet)
    [ -n "$id" ] && [ "$(printf '%s\n' "$id" | wc -l)" -eq 1 ] || fail 'Expected exactly one existing Nestlet container'
    [ "$(docker inspect --format '{{index .Config.Labels "com.docker.compose.service"}}' "$id")" = nestlet ] || fail 'Unexpected Compose service'
    [ "$(docker inspect --format '{{.Config.Image}}' "$id")" = "nestlet:$SHA" ] || fail 'Unexpected runtime image tag'
    [ "$(docker inspect --format '{{.Image}}' "$id")" = "$IMAGE_ID" ] || fail 'Runtime image identity changed'
    [ "$(docker inspect --format '{{.State.Health.Status}}' "$id")" = healthy ] || fail 'Nestlet is not healthy'
    [ "$(docker inspect --format '{{.HostConfig.ReadonlyRootfs}}' "$id")" = true ] || fail 'Root filesystem is not read-only'
    docker inspect --format '{{json .HostConfig.PortBindings}}' "$id" | python3 -c 'import json,sys; assert json.load(sys.stdin)=={"4173/tcp":[{"HostIp":"127.0.0.1","HostPort":"4173"}]}' || fail 'Unexpected published port'
    docker inspect --format '{{json .Mounts}}' "$id" | python3 -c '
import json,sys
m=[v for v in json.load(sys.stdin) if v["Type"]!="tmpfs"]
assert len(m)==1 and m[0]["Type"]=="volume" and m[0]["Name"]=="nestlet_case_data"
assert m[0]["Destination"]=="/data" and m[0]["RW"] is True
' || fail 'Unexpected persistent mount'
    docker volume inspect "$DATA_VOLUME" --format '{{json .}}' | python3 -c '
import json,sys
v=json.load(sys.stdin);labels=v.get("Labels",{})
assert v["Name"]=="nestlet_case_data" and v["Driver"]=="local" and not v.get("Options",{})
assert labels.get("com.docker.compose.project")=="nestlet"
assert labels.get("com.docker.compose.volume")=="case_data"
assert labels.get("com.nestlet.purpose")=="private-case-storage"
' || fail 'Unexpected persistent volume ownership'
    # Read-only SQLite metadata, never account/credential/customer rows.
    compose exec -T --interactive=false nestlet node --input-type=module -e '
import assert from "node:assert/strict";
import {lstatSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
const dir=lstatSync("/data"),file=lstatSync("/data/nestlet.sqlite");
assert(dir.isDirectory());assert.equal(dir.uid,1000);assert.equal(dir.mode&0o777,0o700);
assert(file.isFile());assert.equal(file.nlink,1);assert.equal(file.uid,1000);assert.equal(file.mode&0o777,0o600);
const db=new DatabaseSync("/data/nestlet.sqlite",{readOnly:true,allowExtension:false});
assert.equal(db.prepare("PRAGMA application_id").get().application_id,0x4e53544c);
assert.equal(db.prepare("PRAGMA user_version").get().user_version,3);
assert.equal(db.prepare("PRAGMA quick_check").get().quick_check,"ok");db.close();' >/dev/null 2>&1 || fail 'Private schema3 metadata verification failed'
}
check_public_auth() {
    python3 - <<'PY_AUTH'
import json,urllib.request,sys
try:
    for base in ['http://127.0.0.1:4173','https://nestlet.celerada.link']:
        with urllib.request.urlopen(base+'/api/health',timeout=15) as r:
            assert r.status==200 and json.load(r)=={'ok':True}
        with urllib.request.urlopen(base+'/api/status',timeout=15) as r:
            s=json.load(r)
            assert r.status==200 and s.get('authConfigured') is True
            assert s.get('authenticated') is False and 'csrfToken' not in s
            assert s.get('caseStorageEnabled') is True
except Exception:
    sys.exit(1)
print('Verified public booleans: authConfigured=true, authenticated=false, caseStorageEnabled=true.')
PY_AUTH
}
check_runtime
check_lease
[ "$(docker image inspect --format '{{.Id}}' "nestlet:$SHA")" = "$IMAGE_ID" ] || fail 'Existing image tag changed'
# No retry/reset/rollback changes configuration or data. Any failure is an
# explicit blocker for the operator; keep the evidence limited to public flags.
if ! compose up -d --no-build --pull never --no-deps --force-recreate --wait --wait-timeout 90 nestlet >/dev/null 2>&1; then
    fail 'Same-release recreation failed; configuration and data were not edited. Operator review is required'
fi
check_lease
check_runtime
check_public_auth || fail 'Public authentication is not configured or verification failed; no credential values were read or reset'
echo 'Existing Nestlet release recreated with its preserved configuration and data; no build, migration or other service change.'
