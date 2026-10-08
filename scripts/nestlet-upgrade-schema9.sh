#!/usr/bin/env bash
# Pinned consolidated schema7-to-schema9 release; fresh explicit approval required before publication/dispatch.
# ADDITIVE SCHEMA7 -> SCHEMA9 rollout only; dedicated maintenance dispatch only.
# Keeps the existing Nestlet volume; never automatically restores or downgrades data.
# Changes only Nestlet's release, image tag and current pointer. Never run during
# an operator-setup handoff or any other runtime.env writer.
set -euo pipefail
umask 077
readonly OLD_SHA='05923a88156d8d2d1c497d22c3ef56414452d063'
# Root must replace this only after the actual authorized merge SHA passes application, browser and container CI.
readonly REVIEWED_RELEASE_SHA='bbd240cf35069af97b7d684690bbd12b747ff503'
readonly NEW_SHA="${1:?Supply the exact reviewed schema9 release SHA}"
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
        -u ALIBABA_CLOUD_ACCESS_KEY_ID -u ALIBABA_CLOUD_ACCESS_KEY_SECRET -u ALIBABA_CLOUD_SECURITY_TOKEN -u NESTLET_EMAIL_FROM \
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
    python3 - "${1:-false}" <<'PY'
import json,urllib.request,urllib.error,sys
base='http://127.0.0.1:4173'
def get(path,method='GET'):
    req=urllib.request.Request(base+path,data=b'{}' if method=='POST' else None,method=method,headers={'Origin':'https://nestlet.celerada.link','Content-Type':'application/json'})
    try: result=urllib.request.urlopen(req,timeout=10)
    except urllib.error.HTTPError as error: result=error
    with result: return result.status,json.load(result)
code,body=get('/api/health'); assert code==200 and body=={'ok':True}
code,status=get('/api/status'); assert code==200 and status['authenticated'] is False and 'csrfToken' not in status
assert status['pdfEnabled'] is True and status['workbookEnabled'] is True
assert status['authConfigured'] is True and status.get('caseStorageEnabled') is True
if sys.argv[1]=='true':
    assert status.get('libraryRetrievalEnabled') is True
    assert status.get('emailDeliveryConfigured') is True
    assert status.get('registrationEnabled') is True
    assert status.get('administrator') is False and status.get('canManageAccounts') is False and status.get('canViewDiagnostics') is False
    for path in ['/api/admin/accounts','/api/admin/account-audit','/api/admin/diagnostics']:
        code,body=get(path);assert (code,body.get('code'))==(401,'AUTH_REQUIRED')
    assert not any(key in status for key in ['email','emailVerified','emailDelivery','passwordRecoveryMethod'])
    code,body=get('/api/auth/email/bind','POST');assert (code,body.get('code'))==(401,'AUTH_REQUIRED')
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
# Edit only a literal pinned image-tag value in a dotenv declaration. No secret values, file
# contents, hashes or backups are printed or retained by this operation.
edit_image_tag() {
    python3 - "$ENVFILE" "$1" "$2" "$3" <<'PY'
import os,sys,stat,re,tempfile,fcntl
sys.excepthook=lambda *_:print('Image-tag verification failed.',file=sys.stderr)
path,before,after,mode=sys.argv[1:]
assert mode in ('strict','verified-predecessor')
allowed_before=before.split(',')
assert 1<=len(allowed_before)<=2 and all(re.fullmatch(r'[a-f0-9]{40}',v) for v in allowed_before)
assert re.fullmatch(r'[a-f0-9]{40}',after)
if mode=='verified-predecessor':
    assert before==after=='05923a88156d8d2d1c497d22c3ef56414452d063'
    lock=os.path.join(os.path.dirname(os.path.dirname(path)),'.incremental-release.lock')
    lease=os.fstat(9); named=os.lstat(lock)
    assert stat.S_ISREG(lease.st_mode) and lease.st_uid==os.geteuid() and lease.st_nlink==1 and stat.S_IMODE(lease.st_mode)==0o600
    assert (lease.st_dev,lease.st_ino)==(named.st_dev,named.st_ino) and not stat.S_ISLNK(named.st_mode)
    fcntl.flock(9,fcntl.LOCK_EX|fcntl.LOCK_NB)
lst=os.lstat(path)
assert stat.S_ISREG(lst.st_mode) and lst.st_uid==os.geteuid() and stat.S_IMODE(lst.st_mode)==0o600 and lst.st_nlink==1
fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
with os.fdopen(fd,'rb') as f:
    st=os.fstat(f.fileno()); original=f.read(65537)
assert len(original)<=65536 and (st.st_dev,st.st_ino)==(lst.st_dev,lst.st_ino)
# Locate top-level declarations, skipping quoted multiline unrelated values.
# Never interpolate or evaluate environment text; only one literal tag is accepted.
declarations=[]; offset=0
key_pattern=rb'[ \t]*(?:export[ \t]+)?([^ \t=:\r\n]+)[ \t]*[=:][ \t]*'
while offset<len(original):
    end=original.find(b'\n',offset)
    if end<0:end=len(original)
    line=original[offset:end].removesuffix(b'\r')
    if line.lstrip(b' \t').startswith(b'#'):offset=end+1;continue
    key=re.match(key_pattern,line)
    target=re.match(rb'[ \t]*(?:export[ \t]+)?NESTLET_IMAGE_TAG(?=[ \t=:\r]|$)',line)
    if target:declarations.append((offset,line))
    if key and key[1]!=b'NESTLET_IMAGE_TAG' and line[key.end():key.end()+1] in (b"'",b'"'):
        quote=original[offset+key.end()]; cursor=offset+key.end()+1
        while cursor<len(original):
            if original[cursor]==92:cursor+=2;continue
            if original[cursor]==quote:break
            cursor+=1
        assert cursor<len(original),'Malformed environment declaration'
        end=original.find(b'\n',cursor+1)
        if end<0:end=len(original)
        assert re.fullmatch(rb'[ \t]*(?:#[^\r\n]*)?\r?',original[cursor+1:end]),'Ambiguous environment declaration'
    offset=end+1
assert len(declarations)==1,'Duplicate or missing image-tag declaration'
offset,line=declarations[0]
pattern=(rb'[ \t]*(?:export[ \t]+)?NESTLET_IMAGE_TAG[ \t]*[=:][ \t]*'
         rb'(?:\'(?P<single>[a-f0-9]{40})\'[ \t]*(?:#[^\r\n]*)?'
         rb'|"(?P<double>[a-f0-9]{40})"[ \t]*(?:#[^\r\n]*)?'
         rb'|(?P<bare>[a-f0-9]{40})(?:[ \t]* #[^\r\n]*|[ \t]*))')
found=re.fullmatch(pattern,line)
assert found is not None,'Unsupported image-tag declaration'
group=next(name for name in ('single','double','bare') if found[name] is not None)
assert mode=='verified-predecessor' or found[group].decode() in allowed_before,'Unexpected image tag'
start,end=found.span(group)
updated=original[:offset+start]+after.encode()+original[offset+end:]
if original==updated: sys.exit(0)
if mode=='verified-predecessor':
    # Preserve only the previous literal, never the rest of private configuration.
    receipt_fd,receipt=tempfile.mkstemp(prefix='.previous-image-tag-',dir=os.path.dirname(path))
    with os.fdopen(receipt_fd,'wb') as f:f.write(found[group]+b'\n');f.flush();os.fsync(f.fileno())
    dfd=os.open(os.path.dirname(path),os.O_RDONLY|os.O_DIRECTORY)
    try:os.fsync(dfd)
    finally:os.close(dfd)
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
# All normal transitions retain their explicit old-value allowlist.
set_image_tag() {
    edit_image_tag "$1" "$2" strict
}
# The predecessor is a normal exact-SHA Git checkout. No archive exception or
# generic diagnostic/proof mode is needed for this bounded release.
verify_predecessor() {
    [ "$1" = runtime ] || fail 'Unsupported predecessor check'
    validate_release "$OLD_SHA"
    check_container "$OLD_SHA"
    check_persistent_mount "$OLD_SHA" 7
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
# Compare this non-secret resolved value before build, downtime or migration.
assert s["environment"].get("PUBLIC_ORIGIN")=="https://nestlet.celerada.link","Public origin verification failed"
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
    local sha="${1:-$NEW_SHA}" expected="${2:-9}" id
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
    compose "$NEW_SHA" exec -T --interactive=false nestlet node --check agent-library-tools.js
    for module in library-consent-storage.js auth-session-storage.js conversation-review.js conversation-review-storage.js synchronous-transaction.js conversation-action-contract.js document-context.js chat.js storage.js case-records.js email-auth.js email-auth-domain.js email-auth-storage.js email-delivery.js account-administration.js account-administration-storage.js; do
        compose "$NEW_SHA" exec -T --interactive=false nestlet node --check "$module"
    done
}
if [[ "$current" = "$NEW_RELEASE" ]]; then
    validate_release "$NEW_SHA"
    check_container "$NEW_SHA"
    set_image_tag "$NEW_SHA" "$NEW_SHA"
    check_http true
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
    check_http true
    check_helper_modules
    check_persistent_mount
    switch_pointer "$OLD_RELEASE" "$NEW_RELEASE"
    echo 'Verified the already-running intended release and completed its current pointer; no recreation.'
    exit 0
fi
check_container "$OLD_SHA"
check_persistent_mount "$OLD_SHA" 7
verify_predecessor runtime || fail 'Predecessor verification failed'
check_http
# This new route rejects stale configuration hints; no reconciliation exception.
set_image_tag "$OLD_SHA" "$OLD_SHA"
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
for file in library-consent-storage.js auth-session-storage.js conversation-review.js conversation-review-storage.js synchronous-transaction.js conversation-action-contract.js document-context.js case-records.js chat.js storage.js asset-domain.js asset-records.js private-assets.js asset-image-worker.js scripts/private-data.js scripts/private-data-operations.js agent-library-tools.js email-auth.js email-auth-domain.js email-auth-storage.js email-delivery.js account-administration.js account-administration-storage.js; do
    [ -f "$NEW_RELEASE/$file" ] || fail 'Approved release lacks a required schema9 runtime module'
done
validate_release "$NEW_SHA"
# Pin both immutable image identities; no automatic predecessor restart.
readonly OLD_IMAGE_ID="$(docker image inspect --format '{{.Id}}' "nestlet:$OLD_SHA")"
[[ "$OLD_IMAGE_ID" =~ ^sha256:[a-f0-9]{64}$ ]] || fail 'Invalid prior image identity'
check_compose_scope "$OLD_SHA"
check_compose_scope "$NEW_SHA"
check_data_volume
# Capture a local immutable image ID after the exact-source build.
compose "$NEW_SHA" build --pull
readonly NEW_IMAGE_ID="$(docker image inspect --format '{{.Id}}' "nestlet:$NEW_SHA")"
[[ "$NEW_IMAGE_ID" =~ ^sha256:[a-f0-9]{64}$ ]] || fail 'Invalid built image identity'
readonly SMOKE_NAME="nestlet-schema9-check-$$"
smoke_started=0
changed=0
candidate_started=0
# Only metadata is returned. Never print tenant records, hashes, provider keys,
# rendered Compose config, private-data command output, or container logs.
live_schema() {
    docker run --rm --pull never --network none --read-only --cap-drop ALL \
        --security-opt no-new-privileges:true --pids-limit 32 --memory 256m --cpus 0.5 \
        --user 1000:1000 --mount "type=volume,source=$DATA_VOLUME,target=/source,readonly" \
        "$NEW_IMAGE_ID" node --input-type=module -e '
import {DatabaseSync} from "node:sqlite";
const db=new DatabaseSync("/source/nestlet.sqlite",{readOnly:true,allowExtension:false,timeout:5000});
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
        compose "$NEW_SHA" stop nestlet >/dev/null 2>&1 || true
        echo 'Update stopped. All live data, originals and recovery points retained. No automatic runtime fallback or database restore; separately approved recovery required.' >&2
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
[ -z "$(docker ps -aq --filter 'name=^/'"$SMOKE_NAME"'$')" ] || fail 'Isolated check container name already exists; nothing was removed'
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
await import("./agent-library-tools.js");
await import("./conversation-action-contract.js");
await import("./conversation-review-storage.js");
await import("./auth-session-storage.js");
await import("./library-consent-storage.js");
await import("./synchronous-transaction.js");
await import("./document-context.js");
await import("./case-records.js");
await import("./email-auth-storage.js");
await import("./account-administration.js");
await import("./account-administration-storage.js");
await import("./email-delivery.js");
const db=new DatabaseSync("/data/nestlet.sqlite",{readOnly:true});
assert.equal(db.prepare("PRAGMA user_version").get().user_version,9);
for(const name of ["user_capabilities","account_capability_audit","conversation_review_intents","auth_sessions","library_permissions"])assert.equal(db.prepare("SELECT count(*) AS n FROM "+name).get().n,0);db.close();
const r=await fetch("http://127.0.0.1:4173/api/status");const s=await r.json();
assert.equal(r.status,200);assert.equal(s.authenticated,false);assert.equal(s.authConfigured,false);assert.equal(s.libraryRetrievalEnabled,true);assert.equal(s.emailDeliveryConfigured,false);assert.equal(s.registrationEnabled,false);
for(const path of ["/api/cases","/api/assets","/api/settings","/api/admin/accounts","/api/admin/account-audit","/api/admin/diagnostics"]){const r=await fetch("http://127.0.0.1:4173"+path);assert.equal(r.status,503);}
const page=await fetch("http://127.0.0.1:4173/");assert.equal(page.status,200);
const html=await page.text(),scripts=[...html.matchAll(/<script[^>]+src="([^" ]+)"/g)].map(match=>match[1]);
assert.deepEqual(scripts,["/next/app.js"],"Compiled UI entry must match the pinned Vite output");
for(const path of scripts){const asset=await fetch("http://127.0.0.1:4173"+path);assert.equal(asset.status,200);assert.match(asset.headers.get("content-type")??"",/^text\/javascript(?:;|$)/i);assert.ok((await asset.text()).trim().length>0,"Compiled UI JavaScript is empty");}
console.log("Isolated schema9 startup, compiled UI and unauthenticated boundaries passed.");' </dev/null
docker rm -f "$SMOKE_NAME" >/dev/null
smoke_started=0

# Size-only planning: allow the snapshot, migration/future-version and schema9 round-trip copies plus spare room.
# No private contents are read; a disk shortage is rejected before downtime.
source_bytes=$(compose "$OLD_SHA" exec -T --interactive=false nestlet node --input-type=module -e '
import {lstatSync,readdirSync} from "node:fs";
let total=0;
for(const path of ["/data/nestlet.sqlite","/data/nestlet.sqlite-wal","/data/nestlet.sqlite-journal",...readdirSync("/data/assets").map(name=>"/data/assets/"+name)]){
try{const s=lstatSync(path);if(!s.isFile())throw Error("Unexpected source entry");total+=s.size;}catch(e){if(e.code!=="ENOENT")throw e;}}
if(!Number.isSafeInteger(total)||total<0)process.exit(1);console.log(total);' 2>/dev/null)
[[ "$source_bytes" =~ ^[0-9]+$ ]] || fail 'Cannot safely size private recovery storage'
[ "$(df -Pk "$BASE" | awk 'NR==2 {print $4}')" -ge "$(( (source_bytes * 6 + 2147483648 + 1023) / 1024 ))" ] || fail 'Insufficient private recovery disk space before service stop'

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
[ "$(live_schema)" = 7 ] || fail 'Live database is not the reviewed schema7 predecessor'
private_operation backup --db /source/nestlet.sqlite --assets /source/assets --output /recovery/schema7 \
    || fail 'Private pre-upgrade backup failed; inspect private recovery evidence'
private_operation verify --input /recovery/schema7 || fail 'Private recovery point failed independent verification'
# The schema7 predecessor must also recognize this untouched rollback artifact.
docker run --rm --pull never --network none --read-only --cap-drop ALL \
    --security-opt no-new-privileges:true --pids-limit 64 --memory 768m --cpus 1 \
    --user 1000:1000 --mount "type=bind,source=$RECOVERY_DIR,target=/recovery,readonly" \
    "$OLD_IMAGE_ID" node scripts/private-data.js verify --input /recovery/schema7 \
    >>"$RECOVERY_DIR/operations.log" 2>&1 </dev/null || fail 'Predecessor rejected the schema7 recovery point'
private_operation restore --input /recovery/schema7 --output /recovery/rehearsal \
    || fail 'Isolated restore drill failed'
# Rehearse additive schema7-to-schema9 startup only on this restored copy, never on live data or
# the recovery point. Hashes/rows stay inside this no-network helper and are not
# printed. A separate copy proves future-version refusal without altering this one.
rehearse_additive_migration() {
    docker run --rm --pull never --network none --read-only --cap-drop ALL \
        --security-opt no-new-privileges:true --pids-limit 64 --memory 768m --cpus 1 \
        --user 1000:1000 --mount "type=bind,source=$RECOVERY_DIR,target=/recovery" \
        "$NEW_IMAGE_ID" node --input-type=module -e '
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {openSync,readSync,closeSync} from "node:fs";
import {createHash} from "node:crypto";
import {openStorage} from "./storage.js";
import {AUTH_SESSION_SCHEMA_SQL} from "./auth-session-storage.js";
import {LIBRARY_CONSENT_SCHEMA_SQL} from "./library-consent-storage.js";
import {openAssetVault} from "./private-assets.js";
import {verifyPrivateBackup} from "./scripts/private-data-operations.js";
const path="/recovery/rehearsal/nestlet.sqlite";
const digest=()=>{const fd=openSync(path,"r"),hash=createHash("sha256"),buffer=Buffer.alloc(131072);try{let n;while((n=readSync(fd,buffer,0,buffer.length,null)))hash.update(buffer.subarray(0,n));return hash.digest("hex");}finally{closeSync(fd);}};
const connect=()=>new DatabaseSync(path,{readOnly:true,allowExtension:false,timeout:5000});
const encode=value=>JSON.stringify(value,(_,entry)=>typeof entry==="bigint"?{integer:String(entry)}:entry);
const schema=db=>db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name").all();
const quote=name=>"\""+name.replaceAll("\"","\"\"")+"\"";
const tableDigest=(db,name)=>{const statement=db.prepare("SELECT * FROM "+quote(name)+" ORDER BY rowid");statement.setReadBigInts(true);const hash=createHash("sha256");for(const row of statement.iterate())hash.update(encode(row)+"\n");return hash.digest("hex");};
let db=connect();
assert.equal(db.prepare("PRAGMA user_version").get().user_version,7);
const beforeSchema=schema(db),tables=beforeSchema.filter(row=>row.type==="table").map(row=>row.name);
const beforeRows=tables.map(name=>tableDigest(db,name));db.close();
const store=openStorage({filename:path});store.close();
db=connect();
assert.equal(db.prepare("PRAGMA user_version").get().user_version,9);
assert.equal(db.prepare("PRAGMA application_id").get().application_id,0x4e53544c);
assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check,"ok");
assert.equal(db.prepare("PRAGMA foreign_key_check").all().length,0);
const afterSchema=schema(db);
for(const entry of beforeSchema)assert.ok(afterSchema.some(row=>encode(row)===encode(entry)),"Existing schema object changed");
assert.ok(tables.every((name,index)=>tableDigest(db,name)===beforeRows[index]),"Existing rows changed");
const expected=new DatabaseSync(":memory:");
expected.exec("CREATE TABLE users(id TEXT PRIMARY KEY);CREATE TABLE cases(id TEXT PRIMARY KEY);CREATE TABLE conversations(id TEXT PRIMARY KEY);CREATE TABLE messages(id TEXT PRIMARY KEY);");
expected.exec(AUTH_SESSION_SCHEMA_SQL);expected.exec(LIBRARY_CONSENT_SCHEMA_SQL);
const additions=schema(expected).filter(row=>row.name.startsWith("auth_sessions")||row.name==="sqlite_autoindex_auth_sessions_1"||row.tbl_name==="library_permissions");expected.close();
assert.deepEqual(afterSchema.filter(row=>!beforeSchema.some(old=>old.name===row.name)),additions,"Unexpected migration schema objects");
assert.equal(db.prepare("SELECT count(*) AS n FROM auth_sessions").get().n,0);
assert.equal(db.prepare("SELECT count(*) AS n FROM library_permissions").get().n,0,"Legacy accounts must not receive implicit library grants");
db.close();
const migrated=digest();const again=openStorage({filename:path});again.close();
assert.ok(digest()===migrated,"Repeat schema9 storage opening changed database bytes");
const checked=verifyPrivateBackup({input:"/recovery/schema7"});assert.equal(checked.schemaVersion,7);
const vault=openAssetVault({directory:"/recovery/rehearsal/assets"});
for(const asset of checked.manifest.assets)vault.read(asset);' \
        >>"$RECOVERY_DIR/operations.log" 2>&1 </dev/null
}
rehearse_additive_migration || fail 'Additive schema9 preservation rehearsal failed'
private_operation restore --input /recovery/schema7 --output /recovery/future-check \
    || fail 'Separate future-version refusal drill preparation failed'
rehearse_future_refusal() {
    docker run --rm --pull never --network none --read-only --cap-drop ALL \
        --security-opt no-new-privileges:true --pids-limit 64 --memory 768m --cpus 1 \
        --user 1000:1000 --mount "type=bind,source=$RECOVERY_DIR,target=/recovery" \
        "$NEW_IMAGE_ID" node --input-type=module -e '
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {openSync,readSync,closeSync,readdirSync} from "node:fs";
import {createHash} from "node:crypto";
import {openStorage} from "./storage.js";
const path="/recovery/future-check/nestlet.sqlite";
const db=new DatabaseSync(path,{allowExtension:false,timeout:5000});db.exec("PRAGMA journal_mode=WAL; PRAGMA user_version=10;");db.close();
const digest=()=>{const fd=openSync(path,"r"),hash=createHash("sha256"),buffer=Buffer.alloc(131072);try{let n;while((n=readSync(fd,buffer,0,buffer.length,null)))hash.update(buffer.subarray(0,n));return hash.digest("hex");}finally{closeSync(fd);}};
const before=digest(),files=readdirSync("/recovery/future-check").sort().join("|");
let refused=false;try{const store=openStorage({filename:path});store.close();}catch(error){refused=error.code==="STORAGE_VERSION_UNSUPPORTED";}
assert.ok(refused,"Future schema must fail closed");
assert.ok(digest()===before,"Future-schema refusal changed persistent database bytes");
assert.equal(readdirSync("/recovery/future-check").sort().join("|"),files);
const after=new DatabaseSync(path,{readOnly:true,allowExtension:false});assert.equal(after.prepare("PRAGMA user_version").get().user_version,10);assert.equal(after.prepare("PRAGMA journal_mode").get().journal_mode,"wal");after.close();' \
        >>"$RECOVERY_DIR/operations.log" 2>&1 </dev/null
}
rehearse_future_refusal || fail 'Future-version refusal changed or accepted the isolated copy'

# Use only restored copies. The live volume and runtime environment are absent.
rehearse_schema9_backup() {
    docker run --rm --pull never --network none --read-only --cap-drop ALL \
        --security-opt no-new-privileges:true --pids-limit 64 --memory 768m --cpus 1 \
        --user 1000:1000 --mount "type=bind,source=$RECOVERY_DIR,target=/recovery" \
        "$NEW_IMAGE_ID" node --input-type=module -e '
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {createHash} from "node:crypto";
import {openSync,readSync,closeSync} from "node:fs";
import {backupPrivateData,verifyPrivateBackup,restorePrivateBackup} from "./scripts/private-data-operations.js";
import {openAssetVault} from "./private-assets.js";
const source="/recovery/rehearsal/nestlet.sqlite";
const digest=()=>{const fd=openSync(source,"r"),hash=createHash("sha256"),buffer=Buffer.alloc(131072);try{let n;while((n=readSync(fd,buffer,0,buffer.length,null)))hash.update(buffer.subarray(0,n));return hash.digest("hex");}finally{closeSync(fd);}};
const encode=value=>JSON.stringify(value,(_,entry)=>typeof entry==="bigint"?{integer:String(entry)}:entry);
const quote=name=>"\""+name.replaceAll("\"","\"\"")+"\"";
const snapshot=path=>{const db=new DatabaseSync(path,{readOnly:true,allowExtension:false,timeout:5000});try{
assert.equal(db.prepare("PRAGMA user_version").get().user_version,9);
assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check,"ok");
assert.equal(db.prepare("PRAGMA foreign_key_check").all().length,0);
const schema=db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name").all();
const rows=schema.filter(row=>row.type==="table").map(({name})=>{const statement=db.prepare("SELECT * FROM "+quote(name)+" ORDER BY rowid");statement.setReadBigInts(true);const hash=createHash("sha256");for(const row of statement.iterate())hash.update(encode(row)+"\n");return {name,hash:hash.digest("hex")};});return {schema,rows};}finally{db.close();}};
const before=snapshot(source),bytes=digest();
const saved=await backupPrivateData({filename:source,assetsDirectory:"/recovery/rehearsal/assets",output:"/recovery/schema9-check"});
assert.equal(saved.schemaVersion,9);assert.equal(saved.verified,true);
assert.deepEqual(snapshot("/recovery/schema9-check/nestlet.sqlite"),before,"Backup changed schema9 snapshot rows");
const verified=verifyPrivateBackup({input:"/recovery/schema9-check"});assert.equal(verified.schemaVersion,9);
const restored=await restorePrivateBackup({input:"/recovery/schema9-check",output:"/recovery/schema9-restored"});
assert.equal(restored.schemaVersion,9);
const restoredSnapshot=snapshot(restored.filename);
assert.deepEqual(restoredSnapshot.schema,before.schema);
assert.deepEqual(restoredSnapshot.rows.filter(row=>!["auth_sessions","library_permissions"].includes(row.name)),before.rows.filter(row=>!["auth_sessions","library_permissions"].includes(row.name)),"Restore changed business rows beyond explicit security-state tables");
const restoredDb=new DatabaseSync(restored.filename,{readOnly:true});
assert.equal(restoredDb.prepare("SELECT COUNT(*) AS n FROM auth_sessions").get().n,0,"Restored sessions must be invalidated");assert.equal(restoredDb.prepare("SELECT COUNT(*) AS n FROM library_permissions").get().n,0,"Restored library choices must be unset");restoredDb.close();
assert.equal(verifyPrivateBackup({input:"/recovery/schema9-check"}).schemaVersion,9);
assert.deepEqual(snapshot("/recovery/schema9-check/nestlet.sqlite"),before,"Restore changed the original backup rows");
const vault=openAssetVault({directory:restored.assetsDirectory});for(const asset of verified.manifest.assets)vault.read(asset);
assert.equal(digest(),bytes,"Schema9 backup changed its rehearsal source");' \
        >>"$RECOVERY_DIR/operations.log" 2>&1 </dev/null
}
rehearse_schema9_backup || fail 'Schema9 backup and separate restore rehearsal failed'
# The predecessor must refuse schema9 on a separately restored copy without changing it.
rehearse_predecessor_refusal() {
    docker run --rm --pull never --network none --read-only --cap-drop ALL \
        --security-opt no-new-privileges:true --pids-limit 64 --memory 768m --cpus 1 \
        --user 1000:1000 --mount "type=bind,source=$RECOVERY_DIR,target=/recovery" \
        "$OLD_IMAGE_ID" node --input-type=module -e '
import assert from "node:assert/strict";
import {readFileSync,readdirSync} from "node:fs";
import {createHash} from "node:crypto";
import {openStorage} from "./storage.js";
const root="/recovery/schema9-restored",path=root+"/nestlet.sqlite";
const digest=()=>createHash("sha256").update(readFileSync(path)).digest("hex");
const before=digest(),files=readdirSync(root).sort();
assert.throws(()=>openStorage({filename:path}),error=>error.code==="STORAGE_VERSION_UNSUPPORTED");
assert.equal(digest(),before,"Predecessor refusal changed schema9 bytes");
assert.deepEqual(readdirSync(root).sort(),files);' \
        >>"$RECOVERY_DIR/operations.log" 2>&1 </dev/null
}
rehearse_predecessor_refusal || fail 'Predecessor accepted or changed the separate schema9 copy'

private_operation verify --input /recovery/schema7 || fail 'Recovery point changed during copy rehearsal'
echo 'Private schema7 recovery, additive schema9 preservation, schema9 round-trip, predecessor and future-version refusal rehearsals passed.'
[ "$(docker image inspect --format '{{.Id}}' "nestlet:$NEW_SHA")" = "$NEW_IMAGE_ID" ] || fail 'Candidate image tag changed after validation'
set_image_tag "$OLD_SHA" "$NEW_SHA"
candidate_started=1
compose "$NEW_SHA" up -d --no-build --pull never --no-deps --force-recreate --wait --wait-timeout 90 nestlet
check_container "$NEW_SHA"
check_http true
check_helper_modules
check_persistent_mount "$NEW_SHA" 9
switch_pointer "$OLD_RELEASE" "$NEW_RELEASE"
changed=0
trap - EXIT INT TERM HUP
echo "Nestlet updated to $NEW_SHA; existing configuration and dedicated data retained. Recovery points remain private. Authenticated browser and separately configured real-email delivery acceptance are still required."
