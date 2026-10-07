#!/usr/bin/env bash
# REVIEW DRAFT. Parent must supply the exact approved, CI-green 40-hex commit.
# INCREMENTAL SCHEMA3 -> SCHEMA4 rollout only. Draft; do not dispatch until reviewed.
# Keeps the existing Nestlet volume; never automatically restores or downgrades data.
# Changes only Nestlet's release, image tag and current pointer. Never run during
# an operator-setup handoff or any other runtime.env writer.
set -euo pipefail
umask 077
readonly OLD_SHA='2fc15f216714d0331a82456edb1d97b9f76f8498'
# Root reviewer must replace this only after exact-SHA application/container CI passes.
readonly REVIEWED_RELEASE_SHA='REPLACE_WITH_REVIEWED_40_HEX_RELEASE_SHA'
readonly NEW_SHA="${1:?Supply the exact reviewed schema4 release SHA}"
[[ "$REVIEWED_RELEASE_SHA" =~ ^[a-f0-9]{40}$ && "$NEW_SHA" = "$REVIEWED_RELEASE_SHA" ]] || { echo 'Draft or unreviewed release; deployment is disabled'; exit 1; }
[[ "$NEW_SHA" =~ ^[a-f0-9]{40}$ ]] && [[ "$NEW_SHA" != "$OLD_SHA" ]] || { echo 'Expected a new approved 40-hex commit'; exit 1; }
readonly BASE='/opt/nestlet'
readonly ENVFILE="$BASE/shared/runtime.env"
readonly OLD_RELEASE="$BASE/releases/$OLD_SHA"
readonly NEW_RELEASE="$BASE/releases/$NEW_SHA"
readonly REPO='https://github.com/ledondev520/nestlet.git'
readonly DATA_VOLUME='nestlet_case_data'
export DOCKER_HOST='unix:///var/run/docker.sock'
unset DOCKER_CONTEXT
fail() { printf 'Upgrade stopped: %s\n' "$1" >&2; exit 1; }
for name in git docker python3 stat df flock; do command -v "$name" >/dev/null || fail "Missing tool: $name"; done
uid=$(id -u)
for dir in "$BASE" "$BASE/releases" "$BASE/shared"; do
    [ -d "$dir" ] && [ ! -L "$dir" ] && [ "$(stat -c %u "$dir")" = "$uid" ] && [ "$(stat -c %a "$dir")" = 700 ] || fail 'Unexpected managed directory'
done
[ -f "$BASE/.nestlet-managed" ] && [ ! -L "$BASE/.nestlet-managed" ] && [ "$(stat -c %u "$BASE/.nestlet-managed")" = "$uid" ] && [ "$(cat "$BASE/.nestlet-managed")" = nestlet-managed-stage-v1 ] || fail 'Ownership marker mismatch'
[ -L "$BASE/current" ] || fail 'Missing current release pointer'
current=$(readlink "$BASE/current")
[[ "$current" = "$OLD_RELEASE" || "$current" = "$NEW_RELEASE" ]] || fail 'Unexpected current release; this upgrade is bounded to the reviewed predecessor'
[ -f "$ENVFILE" ] && [ ! -L "$ENVFILE" ] && [ "$(stat -c %u "$ENVFILE")" = "$uid" ] && [ "$(stat -c %a "$ENVFILE")" = 600 ] && [ "$(stat -c %h "$ENVFILE")" = 1 ] || fail 'Unexpected runtime.env ownership, permissions or links'
[ ! -L "$BASE/.incremental-release.lock" ] || fail 'Unsafe maintenance lock'
exec 9>"$BASE/.incremental-release.lock"
flock -n 9 || fail 'Another incremental release is active'
docker compose version >/dev/null
docker info --format '{{.ServerVersion}}' >/dev/null
compose() {
    local sha="$1"; shift
    env -u PUBLIC_ORIGIN -u NESTLET_OPERATOR_USERNAME -u NESTLET_OPERATOR_PASSWORD_HASH -u DEEPSEEK_API_KEY -u DEEPSEEK_MODEL -u ENABLE_LIVE_AI \
        NESTLET_IMAGE_TAG="$sha" docker compose --project-name nestlet --env-file "$ENVFILE" -f "$BASE/releases/$sha/compose.yaml" "$@" </dev/null
}
check_container() {
    local sha="$1" id
    id=$(docker ps -aq --filter label=com.docker.compose.project=nestlet)
    [ -n "$id" ] && [ "$(printf '%s\n' "$id" | wc -l)" -eq 1 ] || fail 'Expected exactly one existing Nestlet container'
    [ "$(docker inspect --format '{{index .Config.Labels "com.docker.compose.service"}}' "$id")" = nestlet ] || fail 'Unexpected Compose service'
    [ "$(docker inspect --format '{{.Config.Image}}' "$id")" = "nestlet:$sha" ] || fail 'Unexpected image'
    [ "$(docker inspect --format '{{.Image}}' "$id")" = "$(docker image inspect --format '{{.Id}}' "nestlet:$sha")" ] || fail 'Local image tag does not match the running release'
    [ "$(docker inspect --format '{{.State.Health.Status}}' "$id")" = healthy ] || fail 'Container is not healthy'
    [ "$(docker inspect --format '{{.HostConfig.ReadonlyRootfs}}' "$id")" = true ] || fail 'Root filesystem is not read-only'
    docker inspect --format '{{json .HostConfig.PortBindings}}' "$id" | python3 -c 'import json,sys; assert json.load(sys.stdin)=={"4173/tcp":[{"HostIp":"127.0.0.1","HostPort":"4173"}]}'
}
check_http() {
    python3 - <<'PY'
import json,urllib.request,urllib.error
base='http://127.0.0.1:4173'
def get(path,method='GET'):
    req=urllib.request.Request(base+path,data=b'{}' if method=='POST' else None,method=method,headers={'Origin':'https://nestlet.celerada.link','Content-Type':'application/json'})
    try: result=urllib.request.urlopen(req,timeout=10)
    except urllib.error.HTTPError as error: result=error
    with result: return result.status,json.load(result)
code,body=get('/api/health'); assert code==200 and body=={'ok':True}
code,status=get('/api/status'); assert code==200 and status['authenticated'] is False and 'csrfToken' not in status
assert status['pdfEnabled'] is True and status['workbookEnabled'] is True
expected=(401,'AUTH_REQUIRED') if status['authConfigured'] else (503,'OPERATOR_SETUP_REQUIRED')
for path,method in [('/api/settings','GET'),('/api/settings','POST'),('/api/settings/test','POST'),('/api/extract','POST'),('/api/document','POST'),('/api/workbook','POST')]:
    code,body=get(path,method); assert (code,body.get('code'))==expected,path
if status.get('caseStorageEnabled') is True:
    code,body=get('/api/cases');assert (code,body.get('code'))==expected,'/api/cases'
    if not status['authConfigured']:
        assert status.get('registrationEnabled') is False
        code,body=get('/api/register','POST');assert (code,body.get('code'))==(503,'OPERATOR_SETUP_REQUIRED'),'/api/register'
print('Loopback health and unauthenticated boundaries passed; no provider calls.')
PY
}
# Edit only the unquoted, pinned image-tag declaration. No secret values, file
# contents, hashes or backups are printed or retained by this operation.
set_image_tag() {
    python3 - "$ENVFILE" "$1" "$2" <<'PY'
import os,sys,stat,re,tempfile
path,before,after=sys.argv[1:]
allowed_before=before.split(',')
assert 1<=len(allowed_before)<=2 and all(re.fullmatch(r'[a-f0-9]{40}',v) for v in allowed_before)
assert re.fullmatch(r'[a-f0-9]{40}',after)
lst=os.lstat(path)
assert stat.S_ISREG(lst.st_mode) and lst.st_uid==os.geteuid() and stat.S_IMODE(lst.st_mode)==0o600 and lst.st_nlink==1
fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
with os.fdopen(fd,'rb') as f:
    st=os.fstat(f.fileno()); original=f.read(65537)
assert len(original)<=65536 and (st.st_dev,st.st_ino)==(lst.st_dev,lst.st_ino)
declarations=re.findall(rb'(?m)^[ \t]*(?:export[ \t]+)?NESTLET_IMAGE_TAG[ \t]*=',original)
assert len(declarations)==1,'Duplicate or missing image-tag declaration'
pattern=rb'(?m)^NESTLET_IMAGE_TAG=([a-f0-9]{40})(\r?)$'
found=list(re.finditer(pattern,original)); assert len(found)==1 and found[0][1].decode() in allowed_before
updated=re.sub(pattern,lambda m:b'NESTLET_IMAGE_TAG='+after.encode()+m[2],original,count=1)
if original==updated: sys.exit(0)
fd,tmp=tempfile.mkstemp(prefix='.image-tag-',dir=os.path.dirname(path))
try:
    with os.fdopen(fd,'wb') as f: f.write(updated); f.flush(); os.fsync(f.fileno())
    now=os.lstat(path)
    assert (now.st_dev,now.st_ino)==(st.st_dev,st.st_ino) and open(path,'rb').read()==original,'Configuration changed concurrently'
    os.replace(tmp,path)
    dfd=os.open(os.path.dirname(path),os.O_RDONLY|os.O_DIRECTORY)
    try: os.fsync(dfd)
    finally: os.close(dfd)
finally:
    if os.path.exists(tmp): os.unlink(tmp)
PY
}
validate_release() {
    local sha="$1" release="$BASE/releases/$1"
    [ -d "$release" ] && [ ! -L "$release" ] && [ "$(stat -c %u "$release")" = "$uid" ] && [ "$(stat -c %a "$release")" = 700 ] || fail 'Unexpected release directory'
    [ "$(git -C "$release" remote get-url origin)" = "$REPO" ] && [ "$(git -C "$release" rev-parse HEAD)" = "$sha" ] && [ -z "$(git -C "$release" status --porcelain --untracked-files=all)" ] || fail 'Release checkout differs from pinned source'
}
check_compose_scope() {
    compose "$1" config --format json | python3 -c '
import json,sys
c=json.load(sys.stdin)
assert set(c["services"])=={"nestlet"},"Only one Nestlet service is allowed"
s=c["services"]["nestlet"]
assert s.get("read_only") is True and not s.get("privileged",False)
assert "ALL" in s.get("cap_drop",[]) and not s.get("cap_add",[])
assert not s.get("devices",[]),"Host devices are forbidden"
assert "no-new-privileges:true" in s.get("security_opt",[]),"Privilege escalation protection is required"
assert not s.get("network_mode") and not s.get("pid") and not s.get("ipc"),"Host namespaces are forbidden"
p=s["ports"];assert len(p)==1 and p[0]["host_ip"]=="127.0.0.1" and str(p[0]["published"])=="4173" and p[0]["target"]==4173
assert not any(v.get("external",False) for v in c.get("networks",{}).values())
mounts=s.get("volumes",[]);assert len(mounts)==1
m=mounts[0];assert m["type"]=="volume" and m["source"]=="case_data" and m["target"]=="/data" and not m.get("read_only",False)
assert not m.get("volume",{}).get("nocopy",False)
assert set(c.get("volumes",{}))=={"case_data"}
v=c["volumes"]["case_data"];assert v["name"]=="nestlet_case_data" and not v.get("external",False)
assert v.get("driver","local")=="local" and not v.get("driver_opts",{})
assert v.get("labels",{}).get("com.nestlet.purpose")=="private-case-storage"
assert s["environment"]["NESTLET_DB_PATH"]=="/data/nestlet.sqlite"
'
}
check_data_volume() {
    # A pre-existing volume is accepted only if it carries this task's exact
    # Compose ownership labels and local driver. Never re-label or erase one.
    local found
    found=$(docker volume ls --format '{{.Name}}' --filter name=^nestlet_case_data$ </dev/null)
    if [ -n "$found" ]; then
        [ "$found" = "$DATA_VOLUME" ] || fail 'Unexpected data-volume match'
        docker volume inspect "$DATA_VOLUME" --format '{{json .}}' | python3 -c '
import json,sys
v=json.load(sys.stdin)
assert v["Name"]=="nestlet_case_data" and v["Driver"]=="local" and not v.get("Options",{})
labels=v.get("Labels",{})
assert labels.get("com.docker.compose.project")=="nestlet"
assert labels.get("com.docker.compose.volume")=="case_data"
assert labels.get("com.nestlet.purpose")=="private-case-storage"
'
    else
        fail 'Existing dedicated data volume is required'
    fi
}
check_persistent_mount() {
    local sha="${1:-$NEW_SHA}" expected="${2:-4}" id
    id=$(compose "$sha" ps -q nestlet)
    docker inspect --format '{{json .Mounts}}' "$id" | python3 -c '
import json,sys
mounts=[m for m in json.load(sys.stdin) if m["Type"]!="tmpfs"]
assert len(mounts)==1
m=mounts[0]
assert m["Type"]=="volume" and m["Name"]=="nestlet_case_data" and m["Destination"]=="/data" and m["RW"] is True
'
    check_data_volume
    # Metadata/liveness only; no tenant rows, credentials or raw materials read.
    compose "$sha" exec -T --interactive=false nestlet node --input-type=module -e '
import assert from "node:assert/strict";
import {statSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
const dir=statSync("/data"),file=statSync("/data/nestlet.sqlite");
assert.equal(dir.mode&0o777,0o700);assert.equal(dir.uid,1000);
assert.equal(file.mode&0o777,0o600);assert.equal(file.uid,1000);
const db=new DatabaseSync("/data/nestlet.sqlite",{readOnly:true});
assert.equal(db.prepare("PRAGMA quick_check").get().quick_check,"ok");
assert.equal(db.prepare("PRAGMA application_id").get().application_id,0x4e53544c);
assert.equal(db.prepare("PRAGMA user_version").get().user_version,Number(process.argv[1]));db.close();
console.log("Dedicated private SQLite file and mount verified; no case records or credentials were returned or logged.");' "$expected"
}

switch_pointer() {
    python3 - "$BASE/current" "$1" "$2" <<'PY_POINTER'
import os,sys,tempfile
path,old,new=sys.argv[1:]
assert os.path.islink(path)
if os.readlink(path)==new:sys.exit(0)
assert os.readlink(path)==old
fd,tmp=tempfile.mkstemp(prefix='.current-',dir=os.path.dirname(path));os.close(fd);os.unlink(tmp)
try:
    os.symlink(new,tmp);os.replace(tmp,path)
    fd=os.open(os.path.dirname(path),os.O_RDONLY|os.O_DIRECTORY)
    try:os.fsync(fd)
    finally:os.close(fd)
finally:
    if os.path.lexists(tmp):os.unlink(tmp)
PY_POINTER
}
check_helper_modules() {
    compose "$NEW_SHA" exec -T --interactive=false nestlet node --check scripts/setup-operator.js
    compose "$NEW_SHA" exec -T --interactive=false nestlet node --check scripts/operator-setup.js
    compose "$NEW_SHA" exec -T --interactive=false nestlet node --check scripts/private-data-operations.js
    compose "$NEW_SHA" exec -T --interactive=false nestlet node --check asset-image-worker.js
}
if [[ "$current" = "$NEW_RELEASE" ]]; then
    validate_release "$NEW_SHA"
    check_container "$NEW_SHA"
    set_image_tag "$NEW_SHA" "$NEW_SHA"
    check_http
    check_helper_modules
    check_persistent_mount
    echo 'Requested release already healthy; no restart or credential change.'
    exit 0
fi
validate_release "$OLD_SHA"
# A transport interruption after successful container recreation can leave the
# old pointer behind. Finish only if the exact intended new release is healthy.
observed=$(docker ps -aq --filter label=com.docker.compose.project=nestlet)
[ -n "$observed" ] && [ "$(printf '%s\n' "$observed" | wc -l)" -eq 1 ] || fail 'Expected exactly one existing Nestlet container'
if [ "$(docker inspect --format '{{.Config.Image}}' "$observed")" = "nestlet:$NEW_SHA" ]; then
    validate_release "$NEW_SHA"
    check_container "$NEW_SHA"
    set_image_tag "$NEW_SHA" "$NEW_SHA"
    check_http
    check_helper_modules
    check_persistent_mount
    switch_pointer "$OLD_RELEASE" "$NEW_RELEASE"
    echo 'Verified the already-running intended release and completed its current pointer; no recreation.'
    exit 0
fi
check_container "$OLD_SHA"
check_persistent_mount "$OLD_SHA" 3
check_http
# If SIGKILL occurred after changing the tag but before recreation, the exact
# predecessor remains healthy/current. Normalize only an OLD or intended NEW
# tag back to OLD before retrying; any third tag or malformed assignment stops.
set_image_tag "$OLD_SHA,$NEW_SHA" "$OLD_SHA"
[ "$(df -Pk "$BASE" | awk 'NR==2 {print $4}')" -ge 2097152 ] || fail 'At least 2 GiB free disk required'
if [ -e "$NEW_RELEASE" ] || [ -L "$NEW_RELEASE" ]; then
    [ -d "$NEW_RELEASE" ] && [ ! -L "$NEW_RELEASE" ] && [ "$(stat -c %u "$NEW_RELEASE")" = "$uid" ] && [ "$(stat -c %a "$NEW_RELEASE")" = 700 ] || fail 'Unexpected new-release directory'
    [ "$(git -C "$NEW_RELEASE" remote get-url origin)" = "$REPO" ] && [ "$(git -C "$NEW_RELEASE" rev-parse HEAD)" = "$NEW_SHA" ] && [ -z "$(git -C "$NEW_RELEASE" status --porcelain --untracked-files=all)" ] || fail 'Existing new checkout differs from pinned source'
else
    git clone --quiet --no-checkout --filter=blob:none "$REPO" "$NEW_RELEASE"
    chmod 700 "$NEW_RELEASE"
    git -C "$NEW_RELEASE" fetch --quiet --depth=1 origin "$NEW_SHA"
    git -C "$NEW_RELEASE" checkout --quiet --detach "$NEW_SHA"
fi
[ "$(git -C "$NEW_RELEASE" rev-parse HEAD)" = "$NEW_SHA" ] || fail 'Pinned checkout mismatch'
for file in storage.js asset-domain.js asset-records.js private-assets.js asset-image-worker.js scripts/private-data.js scripts/private-data-operations.js; do
    [ -f "$NEW_RELEASE/$file" ] || fail 'Approved release lacks a required schema4 runtime module'
done
validate_release "$NEW_SHA"
check_compose_scope "$OLD_SHA"
check_compose_scope "$NEW_SHA"
check_data_volume
# Capture a local immutable image ID after the exact-source build.
compose "$NEW_SHA" build --pull
readonly NEW_IMAGE_ID="$(docker image inspect --format '{{.Id}}' "nestlet:$NEW_SHA")"
[[ "$NEW_IMAGE_ID" =~ ^sha256:[a-f0-9]{64}$ ]] || fail 'Invalid built image identity'
readonly SMOKE_NAME="nestlet-incremental-check-$$"
smoke_started=0
changed=0
# Only metadata is returned. Never print tenant records, hashes, provider keys,
# rendered Compose config, private-data command output, or container logs.
live_schema() {
    docker run --rm --pull never --network none --read-only --cap-drop ALL \
        --security-opt no-new-privileges:true --pids-limit 32 --memory 256m --cpus 0.5 \
        --user 1000:1000 --mount "type=volume,source=$DATA_VOLUME,target=/source,readonly" \
        "$NEW_IMAGE_ID" node --input-type=module -e '
import {DatabaseSync} from "node:sqlite";
const db=new DatabaseSync("/source/nestlet.sqlite",{readOnly:true,allowExtension:false});
if(db.prepare("PRAGMA application_id").get().application_id!==0x4e53544c)process.exit(1);
if(db.prepare("PRAGMA integrity_check").get().integrity_check!=="ok")process.exit(1);
if(db.prepare("PRAGMA foreign_key_check").all().length)process.exit(1);
console.log(db.prepare("PRAGMA user_version").get().user_version);db.close();' </dev/null
}
rollback() {
    local code=$?
    trap - EXIT INT TERM HUP
    if [ "$smoke_started" = 1 ]; then docker rm -f "$SMOKE_NAME" >/dev/null 2>&1 || true; fi
    if [ "$changed" = 1 ]; then
        [ "$code" != 0 ] || code=1
        # Stop only Nestlet before deciding compatibility. A partly started new
        # process must not be able to migrate after this metadata check.
        if compose "$NEW_SHA" stop nestlet >/dev/null && [ "$(live_schema 2>/dev/null)" = 3 ]; then
            if set_image_tag "$OLD_SHA,$NEW_SHA" "$OLD_SHA" && \
                compose "$OLD_SHA" up -d --no-build --pull never --wait --wait-timeout 90 nestlet && \
                check_container "$OLD_SHA" && check_persistent_mount "$OLD_SHA" 3 && check_http; then
                switch_pointer "$NEW_RELEASE" "$OLD_RELEASE" || true
                echo 'Previous schema3 runtime recovered; live data was never restored or replaced.' >&2
            else
                echo 'Nestlet recovery requires operator review; all data and recovery points retained.' >&2
            fi
        else
            echo 'Migrated or unverified live data retained untouched. Old schema3 runtime was NOT restarted. Forward repair or separately approved recovery is required.' >&2
        fi
    fi
    exit "$code"
}
trap rollback EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

# Fresh, throwaway SQLite smoke before live storage is mounted anywhere new.
# No host port, credentials or network. Removing this container only discards
# its temporary synthetic data, never the existing named production volume.
smoke_started=1
docker run -d --pull never --name "$SMOKE_NAME" --network none --read-only \
    --cap-drop ALL --security-opt no-new-privileges:true --pids-limit 96 --memory 768m --cpus 1 \
    --user 1000:1000 --tmpfs /data:rw,noexec,nosuid,nodev,size=64m,uid=1000,gid=1000,mode=700 \
    --tmpfs /tmp:rw,noexec,nosuid,nodev,size=64m,mode=1777 \
    -e NESTLET_DB_PATH=/data/nestlet.sqlite -e ENABLE_LIVE_AI=false \
    -e PUBLIC_ORIGIN=https://nestlet.invalid "$NEW_IMAGE_ID" >/dev/null </dev/null
ready=0
for attempt in $(seq 1 30); do
    if docker exec "$SMOKE_NAME" node ops/healthcheck.mjs >/dev/null 2>&1 </dev/null; then ready=1; break; fi
    sleep 1
done
[ "$ready" = 1 ] || fail 'Isolated candidate runtime failed its fresh-database healthcheck'
docker exec "$SMOKE_NAME" node --input-type=module -e '
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
await import("./scripts/private-data-operations.js");
await import("./private-assets.js");
const db=new DatabaseSync("/data/nestlet.sqlite",{readOnly:true});
assert.equal(db.prepare("PRAGMA user_version").get().user_version,4);db.close();
const r=await fetch("http://127.0.0.1:4173/api/status");const s=await r.json();
assert.equal(r.status,200);assert.equal(s.authenticated,false);assert.equal(s.authConfigured,false);
for(const path of ["/api/cases","/api/assets","/api/settings"]){const r=await fetch("http://127.0.0.1:4173"+path);assert.equal(r.status,503);}
console.log("Isolated schema4 startup and unauthenticated boundaries passed.");' </dev/null
docker rm -f "$SMOKE_NAME" >/dev/null
smoke_started=0

# Backups stay private on this server; same-server recovery is not off-host DR.
# Fresh unique directory per attempt; no overwrite, retention cleanup or deletion.
readonly RECOVERY_ROOT="$BASE/recovery"
if [ ! -e "$RECOVERY_ROOT" ]; then mkdir -m 700 "$RECOVERY_ROOT"; fi
[ -d "$RECOVERY_ROOT" ] && [ ! -L "$RECOVERY_ROOT" ] && [ "$(stat -c %u "$RECOVERY_ROOT")" = "$uid" ] && [ "$(stat -c %a "$RECOVERY_ROOT")" = 700 ] || fail 'Unexpected recovery directory'
RECOVERY_DIR=$(mktemp -d "$RECOVERY_ROOT/incremental-XXXXXXXX")
chown 1000:1000 "$RECOVERY_DIR"
chmod 700 "$RECOVERY_DIR"
private_operation() {
    # Redirect all result paths/error detail into this private run directory.
    # CLI uses SQLite backup API (including WAL), never cp of a live database.
    docker run --rm --pull never --network none --read-only --cap-drop ALL \
        --security-opt no-new-privileges:true --pids-limit 64 --memory 768m --cpus 1 \
        --user 1000:1000 --tmpfs /tmp:rw,noexec,nosuid,nodev,size=64m,mode=1777 \
        --mount "type=volume,source=$DATA_VOLUME,target=/source,readonly" \
        --mount "type=bind,source=$RECOVERY_DIR,target=/recovery" \
        "$NEW_IMAGE_ID" node scripts/private-data.js "$@" \
        >>"$RECOVERY_DIR/operations.log" 2>&1 </dev/null
}
changed=1
compose "$OLD_SHA" stop nestlet
[ "$(live_schema)" = 3 ] || fail 'Live database is not the reviewed schema3 predecessor'
private_operation backup --db /source/nestlet.sqlite --assets /source/assets --output /recovery/schema3 \
    || fail 'Private pre-upgrade backup failed; inspect private recovery evidence'
private_operation verify --input /recovery/schema3 || fail 'Private recovery point failed independent verification'
private_operation restore --input /recovery/schema3 --output /recovery/rehearsal \
    || fail 'Isolated restore drill failed'
# Rehearse the actual schema migration on a restored copy, never the recovery
# point or live DB. Keep both copies on failure for an approved recovery review.
docker run --rm --pull never --network none --read-only --cap-drop ALL \
    --security-opt no-new-privileges:true --pids-limit 64 --memory 768m --cpus 1 \
    --user 1000:1000 --mount "type=bind,source=$RECOVERY_DIR,target=/recovery" \
    "$NEW_IMAGE_ID" node --input-type=module -e '
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {openStorage} from "./storage.js";
const path="/recovery/rehearsal/nestlet.sqlite";
const before=new DatabaseSync(path,{readOnly:true});
assert.equal(before.prepare("PRAGMA user_version").get().user_version,3);before.close();
const store=openStorage({filename:path});store.close();
const db=new DatabaseSync(path,{readOnly:true});
assert.equal(db.prepare("PRAGMA user_version").get().user_version,4);
assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check,"ok");
assert.equal(db.prepare("PRAGMA foreign_key_check").all().length,0);db.close();' \
    >>"$RECOVERY_DIR/operations.log" 2>&1 </dev/null || fail 'Migration rehearsal failed'
private_operation verify --input /recovery/schema3 || fail 'Recovery point changed during rehearsal'
echo 'Private schema3 backup, independent verification and separate migration rehearsal passed.'
[ "$(docker image inspect --format '{{.Id}}' "nestlet:$NEW_SHA")" = "$NEW_IMAGE_ID" ] || fail 'Candidate image tag changed after validation'
set_image_tag "$OLD_SHA" "$NEW_SHA"
compose "$NEW_SHA" up -d --no-build --pull never --force-recreate --wait --wait-timeout 90 nestlet
check_container "$NEW_SHA"
check_http
check_helper_modules
check_persistent_mount "$NEW_SHA" 4
switch_pointer "$OLD_RELEASE" "$NEW_RELEASE"
changed=0
trap - EXIT INT TERM HUP
echo "Nestlet upgraded to $NEW_SHA; existing configuration and dedicated data retained. Recovery points remain private. Authenticated browser acceptance is still required."
