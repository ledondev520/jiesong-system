#!/usr/bin/env bash
# REVIEW DRAFT. Parent must supply the exact approved, CI-green 40-hex commit.
# Changes only Nestlet's release, image tag and current pointer. Never run during
# an operator-setup handoff or any other runtime.env writer.
set -euo pipefail
umask 077
readonly OLD_SHA='8b42962e55305e3cc70b7c20ce5d7e4d74ed13c7'
readonly NEW_SHA="${1:?Supply the approved helper-enabled commit SHA}"
[[ "$NEW_SHA" =~ ^[a-f0-9]{40}$ ]] && [[ "$NEW_SHA" != "$OLD_SHA" ]] || { echo 'Expected a new approved 40-hex commit'; exit 1; }
readonly BASE='/opt/nestlet'
readonly ENVFILE="$BASE/shared/runtime.env"
readonly OLD_RELEASE="$BASE/releases/$OLD_SHA"
readonly NEW_RELEASE="$BASE/releases/$NEW_SHA"
readonly REPO='https://github.com/ledondev520/nestlet.git'
export DOCKER_HOST='unix:///var/run/docker.sock'
unset DOCKER_CONTEXT
fail() { printf 'Upgrade stopped: %s\n' "$1" >&2; exit 1; }
for name in git docker python3 stat df; do command -v "$name" >/dev/null || fail "Missing tool: $name"; done
uid=$(id -u)
for dir in "$BASE" "$BASE/releases" "$BASE/shared"; do
    [ -d "$dir" ] && [ ! -L "$dir" ] && [ "$(stat -c %u "$dir")" = "$uid" ] && [ "$(stat -c %a "$dir")" = 700 ] || fail 'Unexpected managed directory'
done
[ -f "$BASE/.nestlet-managed" ] && [ ! -L "$BASE/.nestlet-managed" ] && [ "$(stat -c %u "$BASE/.nestlet-managed")" = "$uid" ] && [ "$(cat "$BASE/.nestlet-managed")" = nestlet-managed-stage-v1 ] || fail 'Ownership marker mismatch'
[ -L "$BASE/current" ] || fail 'Missing current release pointer'
current=$(readlink "$BASE/current")
[[ "$current" = "$OLD_RELEASE" || "$current" = "$NEW_RELEASE" ]] || fail 'Unexpected current release; this upgrade is bounded to the reviewed predecessor'
[ -f "$ENVFILE" ] && [ ! -L "$ENVFILE" ] && [ "$(stat -c %u "$ENVFILE")" = "$uid" ] && [ "$(stat -c %a "$ENVFILE")" = 600 ] && [ "$(stat -c %h "$ENVFILE")" = 1 ] || fail 'Unexpected runtime.env ownership, permissions or links'
docker compose version >/dev/null
docker info --format '{{.ServerVersion}}' >/dev/null
compose() {
    local sha="$1"; shift
    env -u PUBLIC_ORIGIN -u NESTLET_OPERATOR_PASSWORD_HASH -u DEEPSEEK_API_KEY -u DEEPSEEK_MODEL -u ENABLE_LIVE_AI \
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
assert not s.get("volumes",[]) and not s.get("devices",[]),"Host mounts/devices are forbidden"
assert not s.get("network_mode") and not s.get("pid") and not s.get("ipc"),"Host namespaces are forbidden"
p=s["ports"];assert len(p)==1 and p[0]["host_ip"]=="127.0.0.1" and str(p[0]["published"])=="4173" and p[0]["target"]==4173
assert not any(v.get("external",False) for v in c.get("networks",{}).values())
'
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
}
if [[ "$current" = "$NEW_RELEASE" ]]; then
    validate_release "$NEW_SHA"
    check_container "$NEW_SHA"
    set_image_tag "$NEW_SHA" "$NEW_SHA"
    check_http
    check_helper_modules
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
    switch_pointer "$OLD_RELEASE" "$NEW_RELEASE"
    echo 'Verified the already-running intended release and completed its current pointer; no recreation.'
    exit 0
fi
check_container "$OLD_SHA"
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
[ -f "$NEW_RELEASE/scripts/setup-operator.js" ] && [ -f "$NEW_RELEASE/scripts/operator-setup.js" ] || fail 'Approved release lacks setup helper modules'
validate_release "$NEW_SHA"
check_compose_scope "$OLD_SHA"
check_compose_scope "$NEW_SHA"
compose "$NEW_SHA" build --pull
changed=0
service_changed=0
rollback() {
    local code=$?
    # An EOF/consumed-script exit can be zero without reaching the success marker.
    # Any unfinished mutation must fail CI even when targeted rollback succeeds.
    if [ "$changed" = 1 ] && [ "$code" = 0 ]; then code=1; fi
    trap - EXIT INT TERM HUP
    if [ "$changed" = 1 ]; then
        echo 'New-release verification failed; restoring only the previous Nestlet image tag/container/pointer.' >&2
        if set_image_tag "$NEW_SHA" "$OLD_SHA" || set_image_tag "$OLD_SHA" "$OLD_SHA"; then
            if [ "$service_changed" = 0 ] || { compose "$OLD_SHA" up -d --no-build --pull never --force-recreate --wait --wait-timeout 90 nestlet && check_container "$OLD_SHA" && check_http; }; then
                switch_pointer "$NEW_RELEASE" "$OLD_RELEASE" || echo 'Previous container is healthy, but current pointer needs review.' >&2
            else
                echo 'Targeted container rollback needs operator review; no other service was changed.' >&2
            fi
        else
            echo 'Runtime configuration changed unexpectedly; stopped without overwriting it. Targeted rollback needs review.' >&2
        fi
    fi
    exit "$code"
}
trap rollback EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP
changed=1
set_image_tag "$OLD_SHA" "$NEW_SHA"
service_changed=1
compose "$NEW_SHA" up -d --no-build --pull never --force-recreate --wait --wait-timeout 90 nestlet
check_container "$NEW_SHA"
check_http
# Presence/import verification only, never invokes credential entry.
check_helper_modules
# Current points to the release only after all new-release checks pass.
switch_pointer "$OLD_RELEASE" "$NEW_RELEASE"
changed=0
trap - EXIT INT TERM HUP
echo "Nestlet upgraded to $NEW_SHA; runtime credentials preserved. TLS and user-run operator setup remain separate gates."
