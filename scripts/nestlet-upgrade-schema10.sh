#!/usr/bin/env bash
# Pinned schema9-to10 durable-provider release; dispatch requires final CI and release GO.
# ADDITIVE SCHEMA9 -> SCHEMA10 rollout only; dedicated maintenance dispatch only.
# Keeps the existing Nestlet volume; never automatically restores or downgrades data.
# Bounds changes to Nestlet release and specifically approved private provider storage.
# Never run during an operator-setup handoff or any other runtime.env writer.
set -euo pipefail
umask 077
readonly OLD_SHA='f738655ccab834d77d9204ebab25ab1e2a61d8ee'
# Root must replace this only after the actual authorized merge SHA passes application, browser and container CI.
readonly REVIEWED_RELEASE_SHA='1d6c2592118977455a29ed4e7d7c5b1153362d0c'
readonly NEW_SHA="${1:?Supply the exact reviewed schema10 release SHA}"
[[ "$REVIEWED_RELEASE_SHA" =~ ^[a-f0-9]{40}$ && "$NEW_SHA" = "$REVIEWED_RELEASE_SHA" ]] || { echo 'Draft or unreviewed release; deployment is disabled'; exit 1; }
[[ "$NEW_SHA" =~ ^[a-f0-9]{40}$ ]] && [[ "$NEW_SHA" != "$OLD_SHA" ]] || { echo 'Expected a new approved 40-hex commit'; exit 1; }
readonly SECURITY_ACTION_APPROVED="${2:-false}"
[ "$SECURITY_ACTION_APPROVED" = true ] || { echo 'Specific host security action approval is required'; exit 1; }
readonly BASE='/opt/nestlet'
readonly ENVFILE="$BASE/shared/runtime.env"
readonly OLD_RELEASE="$BASE/releases/$OLD_SHA"
readonly NEW_RELEASE="$BASE/releases/$NEW_SHA"
readonly REPO='https://github.com/ledondev520/nestlet.git'
readonly DATA_VOLUME='nestlet_case_data'
export DOCKER_HOST='unix:///var/run/docker.sock'
unset DOCKER_CONTEXT
fail() { printf 'Upgrade stopped: %s\n' "$1" >&2; exit 1; }
for name in git docker python3 stat df flock cmp; do command -v "$name" >/dev/null || fail "Missing tool: $name"; done
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
readonly PROVIDER_OVERLAY="$BASE/shared/provider-compose.yaml"
provider_overlay_verified=false
compose() {
    local sha="$1"; shift
    local -a overlays=()
    if [ "$sha" = "$NEW_SHA" ]; then overlays=(-f "$PROVIDER_OVERLAY"); fi
    env -u PUBLIC_ORIGIN -u NESTLET_OPERATOR_USERNAME -u NESTLET_OPERATOR_PASSWORD_HASH -u DEEPSEEK_API_KEY -u DEEPSEEK_MODEL -u ENABLE_LIVE_AI \
        -u ALIBABA_CLOUD_ACCESS_KEY_ID -u ALIBABA_CLOUD_ACCESS_KEY_SECRET -u ALIBABA_CLOUD_SECURITY_TOKEN -u NESTLET_EMAIL_FROM \
        -u NESTLET_PROVIDER_WRAPPING_KEY_FILE -u NESTLET_PROVIDER_CONFIG_PATH \
        NESTLET_IMAGE_TAG="$sha" docker compose --project-name nestlet --env-file "$ENVFILE" -f "$BASE/releases/$sha/compose.yaml" "${overlays[@]}" "$@" </dev/null
}
prepare_provider_overlay() {
    python3 - "$PROVIDER_OVERLAY" <<'PY_OVERLAY' || return 1
import os,stat,sys
path=sys.argv[1]
expected=b"""services:
  nestlet:
    environment:
      NESTLET_PROVIDER_CONFIG_PATH: /provider-config/provider-config.sqlite
      NESTLET_PROVIDER_WRAPPING_KEY_FILE: /run/nestlet-private/provider-wrapping.key
    volumes:
      - type: bind
        source: /opt/nestlet/provider-config
        target: /provider-config
        bind:
          create_host_path: false
      - type: bind
        source: /opt/nestlet/secrets/provider-wrapping.key
        target: /run/nestlet-private/provider-wrapping.key
        read_only: true
        bind:
          create_host_path: false
"""
if os.path.lexists(path):
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
    with os.fdopen(fd,'rb') as f:
        i=os.fstat(f.fileno());assert stat.S_ISREG(i.st_mode) and i.st_uid==0 and stat.S_IMODE(i.st_mode)==0o600 and i.st_nlink==1
        assert f.read(4097)==expected
else:
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'wb') as f:f.write(expected);f.flush();os.fsync(f.fileno())
PY_OVERLAY
    provider_overlay_verified=true
}

prepare_provider_security() {
    python3 - --security-action-approved <<'PY_BOOTSTRAP'
#!/usr/bin/env python3
"""Host-local security preparation; explicit execution approval required. Never prints or exports key material."""
import os
import pathlib
import stat
import sys

BASE = pathlib.Path('/opt/nestlet')
SERVICE_UID = 1000

def directory(path, owner, mode, create=False):
    if create:
        try:
            os.mkdir(path, mode)
            os.chown(path, owner, owner)
            os.chmod(path, mode)
        except FileExistsError:
            pass
    info = os.lstat(path)
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != owner or stat.S_IMODE(info.st_mode) != mode:
        raise ValueError('Unexpected private directory metadata')

def verify_key(path, owner=SERVICE_UID):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != owner or stat.S_IMODE(info.st_mode) not in (0o400, 0o600) or info.st_nlink != 1 or info.st_size != 32:
            raise ValueError('Unexpected wrapping-file metadata')
        # No key bytes are read for metadata verification.
    finally:
        os.close(fd)

def prepare(base, root_uid=0, service_uid=SERVICE_UID):
    directory(base, root_uid, 0o700)
    secret = base / 'secrets'
    config = base / 'provider-config'
    directory(secret, root_uid, 0o700, create=True)
    directory(config, service_uid, 0o700, create=True)
    key = secret / 'provider-wrapping.key'
    if os.path.lexists(key):
        verify_key(key, service_uid)
        return
    # Never generate a replacement key for existing ciphertext or ambiguous state.
    if any(config.iterdir()) or any(secret.iterdir()):
        raise ValueError('Existing private state requires operator recovery')
    fd = os.open(key, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o400)
    try:
        os.fchmod(fd, 0o400)
        os.fchown(fd, service_uid, service_uid)
        payload = os.urandom(32)
        if os.write(fd, payload) != 32:
            raise ValueError('Incomplete wrapping-file initialization')
        os.fsync(fd)
    finally:
        os.close(fd)
    fd = os.open(secret, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)
    verify_key(key, service_uid)

if __name__ == '__main__':
    try:
        if sys.argv[1:] != ['--security-action-approved'] or os.geteuid() != 0:
            raise ValueError('Specific host security approval and root execution required')
        prepare(BASE)
        print('Private provider storage metadata verified; no key material returned.')
    except Exception:
        print('Provider security bootstrap refused; preserve all existing files for operator review.', file=sys.stderr)
        sys.exit(1)

PY_BOOTSTRAP
}
check_provider_store() {
    local image="${NEW_IMAGE_ID:-$(docker image inspect --format '{{.Id}}' "nestlet:$NEW_SHA")}"
    docker run --rm --pull never --network none --read-only --cap-drop ALL \
      --security-opt no-new-privileges:true --pids-limit 64 --memory 768m --cpus 1 \
      --user 1000:1000 --tmpfs /tmp:rw,noexec,nosuid,nodev,size=64m,mode=1777 \
      --mount type=bind,source=/opt/nestlet/provider-config,target=/provider-config \
      --mount type=bind,source=/opt/nestlet/secrets/provider-wrapping.key,target=/run/nestlet-private/provider-wrapping.key,readonly \
      "$image" node --input-type=module -e '
import assert from "node:assert/strict";
import {openProviderConfig} from "./provider-config-storage.js";
const store=openProviderConfig({filename:"/provider-config/provider-config.sqlite",wrappingKeyFile:"/run/nestlet-private/provider-wrapping.key",excludedDirectories:["/data"]});
assert.equal(store.available,true);store.load();store.close();
console.log("Encrypted provider storage readiness verified; no credential data returned.");' </dev/null
}
backup_provider_ciphertext() {
    python3 - "$RECOVERY_DIR" <<'PY_CIPHER'
import os,stat,sys,pathlib,hashlib
sys.excepthook=lambda *_:print('Private provider ciphertext backup refused.',file=sys.stderr)
root=pathlib.Path('/opt/nestlet/provider-config');path=root/'provider-config.sqlite'
assert set(p.name for p in root.iterdir()) in (set(),{'provider-config.sqlite'})
if not os.path.lexists(path):sys.exit(0)
fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
with os.fdopen(fd,'rb') as f:
    info=os.fstat(f.fileno());assert stat.S_ISREG(info.st_mode) and info.st_uid==1000 and stat.S_IMODE(info.st_mode)==0o600 and info.st_nlink==1 and 0<info.st_size<=1048576
    content=f.read(1048577);assert len(content)==info.st_size
# Validate only public SQLite header fields, without querying encrypted record bytes.
assert content[:16]==b'SQLite format 3\0' and int.from_bytes(content[68:72],'big')==0x4e535043 and int.from_bytes(content[60:64],'big')==1
out=pathlib.Path(sys.argv[1])/'provider-ciphertext';os.mkdir(out,0o700)
destination=out/'provider-config.sqlite';fd=os.open(destination,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
with os.fdopen(fd,'wb') as f:f.write(content);f.flush();os.fsync(f.fileno())
for directory in [out,out.parent]:
    fd=os.open(directory,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:os.fsync(fd)
    finally:os.close(fd)
assert destination.read_bytes()==content
fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
with os.fdopen(fd,'rb') as f:assert f.read(1048577)==content
print('Separate private provider ciphertext copy verified; wrapping key excluded; no cleanup.')
PY_CIPHER
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
    assert before==after=='f738655ccab834d77d9204ebab25ab1e2a61d8ee'
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
    check_persistent_mount "$OLD_SHA" 9
}
validate_release() {
    local sha="$1" release="$BASE/releases/$1"
    [ -d "$release" ] && [ ! -L "$release" ] && [ "$(stat -c %u "$release")" = "$uid" ] && [ "$(stat -c %a "$release")" = 700 ] || fail 'Unexpected release directory'
    [ "$(git -C "$release" remote get-url origin)" = "$REPO" ] && [ "$(git -C "$release" rev-parse HEAD)" = "$sha" ] && [ -z "$(git -C "$release" status --porcelain --untracked-files=all)" ] || fail 'Release checkout differs from pinned source'
}
check_compose_scope() {
    local compose_version
    compose_version="$(docker compose version --short)"
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
mounts=s.get("volumes",[])
provider=s["environment"].get("NESTLET_PROVIDER_CONFIG_PATH")=="/provider-config/provider-config.sqlite"
assert len(mounts)==(3 if provider else 1)
if len(sys.argv)>1:assert provider==(sys.argv[1]==sys.argv[2])
if provider:
    assert len(sys.argv)>4 and sys.argv[4]=="true","Explicit-false overlay proof is required"
    assert {v["target"] for v in mounts}=={"/data","/provider-config","/run/nestlet-private/provider-wrapping.key"}
    assert s["environment"]["NESTLET_PROVIDER_WRAPPING_KEY_FILE"]=="/run/nestlet-private/provider-wrapping.key"
    expected={"/provider-config":("/opt/nestlet/provider-config",False),"/run/nestlet-private/provider-wrapping.key":("/opt/nestlet/secrets/provider-wrapping.key",True)}
    for v in mounts:
        if v["target"]=="/data":continue
        assert v["target"] in expected
        source,ro=expected[v["target"]]
        bind=v.get("bind",{});assert isinstance(bind,dict)
        # This exact installed version omits false during JSON normalization.
        # prepare_provider_overlay separately verifies immutable explicit-false YAML.
        omitted_false=("create_host_path" not in bind and len(sys.argv)>3 and sys.argv[3]=="2.40.3+ds1-0ubuntu1~24.04.1")
        assert v["type"]=="bind" and v["source"]==source and v.get("read_only",False)==ro
        assert bind.get("create_host_path") is False or omitted_false
m=next(v for v in mounts if v["target"]=="/data");assert m["type"]=="volume" and m["source"]=="case_data" and m["target"]=="/data" and not m.get("read_only",False)
assert not m.get("volume",{}).get("nocopy",False)
assert set(c.get("volumes",{}))=={"case_data"}
v=c["volumes"]["case_data"];assert v["name"]=="nestlet_case_data" and not v.get("external",False)
assert v.get("driver","local")=="local" and not v.get("driver_opts",{})
assert v.get("labels",{}).get("com.nestlet.purpose")=="private-case-storage"
assert s["environment"]["NESTLET_DB_PATH"]=="/data/nestlet.sqlite"
# Compare this non-secret resolved value before build, downtime or migration.
assert s["environment"].get("PUBLIC_ORIGIN")=="https://nestlet.celerada.link","Public origin verification failed"
' "$1" "$NEW_SHA" "$compose_version" "$provider_overlay_verified"
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
    local sha="${1:-$NEW_SHA}" expected="${2:-10}" id
    id=$(compose "$sha" ps -q nestlet)
    docker inspect --format '{{json .Mounts}}' "$id" | python3 -c '
import json,sys
mounts=[m for m in json.load(sys.stdin) if m["Type"]!="tmpfs"]
assert len(mounts)==(3 if sys.argv[1]=="10" else 1)
if len(mounts)==3:
    assert {v["Destination"] for v in mounts}=={"/data","/provider-config","/run/nestlet-private/provider-wrapping.key"}
    expected={"/provider-config":("/opt/nestlet/provider-config",True),"/run/nestlet-private/provider-wrapping.key":("/opt/nestlet/secrets/provider-wrapping.key",False)}
    for m in mounts:
        if m["Destination"]=="/data":continue
        assert m["Destination"] in expected
        source,rw=expected[m["Destination"]]
        assert m["Type"]=="bind" and m["Source"]==source and m["RW"]==rw
m=next(m for m in mounts if m["Destination"]=="/data")
assert m["Type"]=="volume" and m["Name"]=="nestlet_case_data" and m["Destination"]=="/data" and m["RW"] is True
' "$expected"
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
    for module in provider-config-storage.js document-pdf.js provider-metadata.js service-entitlements.js service-entitlement-storage.js service-recovery.js record-display-ids.js review-operation.js library-consent-storage.js auth-session-storage.js conversation-review.js conversation-review-storage.js synchronous-transaction.js conversation-action-contract.js document-context.js chat.js storage.js case-records.js email-auth.js email-auth-domain.js email-auth-storage.js email-delivery.js account-administration.js account-administration-storage.js; do
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
    check_provider_store || fail 'Encrypted provider readiness failed'
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
    check_provider_store || fail 'Encrypted provider readiness failed'
    switch_pointer "$OLD_RELEASE" "$NEW_RELEASE"
    echo 'Verified the already-running intended release and completed its current pointer; no recreation.'
    exit 0
fi
check_container "$OLD_SHA"
check_persistent_mount "$OLD_SHA" 9
verify_predecessor runtime || fail 'Predecessor verification failed'
check_http
preflight_telemetry_preservation() {
    compose "$OLD_SHA" exec -T --interactive=false nestlet node --input-type=module -e '
import {DatabaseSync} from "node:sqlite";
import {TELEMETRY_LIMITS} from "./telemetry.js";
const db=new DatabaseSync("/data/nestlet.sqlite",{readOnly:true,allowExtension:false,timeout:5000});
try{
 db.exec("BEGIN");
 const cutoff=new Date(Date.now()-TELEMETRY_LIMITS.retentionDays*86400000+3600000).toISOString();
 if(db.prepare("SELECT count(*) AS n FROM telemetry_events WHERE created_at < ?").get(cutoff).n)process.exitCode=1;
 if(db.prepare("SELECT count(*) AS n FROM telemetry_workflows WHERE updated_at < ? AND NOT EXISTS (SELECT 1 FROM telemetry_events WHERE workflow_id=telemetry_workflows.id)").get(cutoff).n)process.exitCode=1;
 if(db.prepare("SELECT count(*) AS n FROM telemetry_events").get().n>TELEMETRY_LIMITS.eventsGlobal)process.exitCode=1;
 db.exec("ROLLBACK");
}finally{db.close();}' >/dev/null 2>&1
}
preflight_telemetry_preservation || fail 'Retention or count pruning would break strict preservation; old service remains running'
# Compare only effective enablement/presence. No key bytes leave the private pipe.
compose "$OLD_SHA" config --format json | python3 -c '
import json,sys,urllib.request
s=json.load(sys.stdin)["services"]["nestlet"]["environment"]
with urllib.request.urlopen("http://127.0.0.1:4173/api/status",timeout=10) as r:live=json.load(r)
configured=bool(s.get("DEEPSEEK_API_KEY"));planned=s.get("ENABLE_LIVE_AI")=="true" and configured
current=live.get("liveEnabled");assert isinstance(current,bool)
print(json.dumps({"environment_provider_present":configured,"environment_live_enabled":planned,"current_live_enabled":current},sort_keys=True))
assert configured,"Existing environment provider baseline is absent"
assert current==planned,"Runtime enablement differs from retained environment"
' 2>/dev/null || fail 'Provider baseline metadata requires operator resolution before downtime'

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
for file in provider-config-storage.js document-pdf.js provider-metadata.js service-entitlements.js service-entitlement-storage.js service-recovery.js record-display-ids.js review-operation.js library-consent-storage.js auth-session-storage.js conversation-review.js conversation-review-storage.js synchronous-transaction.js conversation-action-contract.js document-context.js case-records.js chat.js storage.js asset-domain.js asset-records.js private-assets.js asset-image-worker.js scripts/private-data.js scripts/private-data-operations.js agent-library-tools.js email-auth.js email-auth-domain.js email-auth-storage.js email-delivery.js account-administration.js account-administration-storage.js; do
    [ -f "$NEW_RELEASE/$file" ] || fail 'Approved release lacks a required schema9 runtime module'
done
validate_release "$NEW_SHA"
for file in auth.js auth-session-storage.js library-consent-storage.js email-auth.js email-auth-storage.js account-administration-storage.js conversation-review-storage.js private-assets.js telemetry.js; do
    cmp --silent "$OLD_RELEASE/$file" "$NEW_RELEASE/$file" || fail 'Grounded review changed persisted-data, auth or deployment contract'
done
# Permit only the reviewed public module packaging and test/check additions.
check_packaging_contract() {
    python3 - "$NEW_RELEASE" <<'PY_PACKAGE'
import pathlib,hashlib,sys
root=pathlib.Path(sys.argv[1])
expected={'Dockerfile': 'aa919074f0724bfdf5c17bdd91d4410b334d9991616ceef04d53255eaa57f9ba', '.dockerignore': '9b43118b6585304ff77b2bda0728553d67b2293cc82a275bdaf4bb324e3fc63a', 'package.json': '7058b3609ccfb339291ee8f6b7ec4c17a8618440be3cfb1100f81cd8ebda1512', 'package-lock.json': '28ebaeeb138cea6ff0d55ae770e11d6699ae47d5d6fef4587c5b87257118fd27', 'compose.yaml': '2e5f6e8d409f38b27a28d262a1031b58aa920fcd511920e9ef4966f71266e4d6'} # Exact merged 1d6c259 packaging; independently reviewed unchanged contract
assert set(expected)=={'Dockerfile','.dockerignore','package.json','package-lock.json','compose.yaml'}
for name,digest in expected.items():assert hashlib.sha256((root/name).read_bytes()).hexdigest()==digest
PY_PACKAGE
}
check_packaging_contract || fail 'Packaging changed beyond reviewed module inclusion'
# Pin both immutable image identities; no automatic predecessor restart.
readonly OLD_IMAGE_ID="$(docker image inspect --format '{{.Id}}' "nestlet:$OLD_SHA")"
[[ "$OLD_IMAGE_ID" =~ ^sha256:[a-f0-9]{64}$ ]] || fail 'Invalid prior image identity'
prepare_provider_overlay
check_compose_scope "$OLD_SHA"
check_compose_scope "$NEW_SHA"
check_data_volume
# Capture a local immutable image ID after the exact-source build.
compose "$NEW_SHA" build --pull
readonly NEW_IMAGE_ID="$(docker image inspect --format '{{.Id}}' "nestlet:$NEW_SHA")"
[[ "$NEW_IMAGE_ID" =~ ^sha256:[a-f0-9]{64}$ ]] || fail 'Invalid built image identity'
readonly SMOKE_NAME="nestlet-schema10-check-$$"
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
await import("./review-operation.js");
for(const module of ["provider-config-storage.js","document-pdf.js","provider-metadata.js","service-entitlements.js","service-entitlement-storage.js","service-recovery.js","record-display-ids.js"])await import("./"+module);
await import("./synchronous-transaction.js");
await import("./document-context.js");
await import("./case-records.js");
await import("./email-auth-storage.js");
await import("./account-administration.js");
await import("./account-administration-storage.js");
await import("./email-delivery.js");
const db=new DatabaseSync("/data/nestlet.sqlite",{readOnly:true});
assert.equal(db.prepare("PRAGMA user_version").get().user_version,10);
for(const name of ["user_capabilities","account_capability_audit","conversation_review_intents","auth_sessions","library_permissions","service_entitlements","service_entitlement_audit","service_usage","service_recovery_receipts","record_display_ids","record_display_counters"])assert.equal(db.prepare("SELECT count(*) AS n FROM "+name).get().n,0);db.close();
const r=await fetch("http://127.0.0.1:4173/api/status");const s=await r.json();
assert.equal(r.status,200);assert.equal(s.authenticated,false);assert.equal(s.authConfigured,false);assert.equal(s.libraryRetrievalEnabled,true);assert.equal(s.emailDeliveryConfigured,false);assert.equal(s.registrationEnabled,false);
for(const path of ["/api/cases","/api/assets","/api/settings","/api/admin/accounts","/api/admin/account-audit","/api/admin/diagnostics","/api/admin/services","/api/admin/service-audit","/api/service"]){const r=await fetch("http://127.0.0.1:4173"+path);assert.equal(r.status,503);}
const page=await fetch("http://127.0.0.1:4173/");assert.equal(page.status,200);
const html=await page.text(),scripts=[...html.matchAll(/<script[^>]+src="([^" ]+)"/g)].map(match=>match[1]);
assert.deepEqual(scripts,["/next/app.js"],"Compiled UI entry must match the pinned Vite output");
for(const path of scripts){const asset=await fetch("http://127.0.0.1:4173"+path);assert.equal(asset.status,200);assert.match(asset.headers.get("content-type")??"",/^text\/javascript(?:;|$)/i);assert.ok((await asset.text()).trim().length>0,"Compiled UI JavaScript is empty");}
console.log("Isolated schema10 startup, compiled UI and unauthenticated boundaries passed.");' </dev/null
# Synthetic PDF uses packaged worker/font tools, with no customer data or providers.
docker exec "$SMOKE_NAME" node -e '(async()=>{
const assert=require("node:assert/strict"),{spawnSync}=require("node:child_process");
const {createDocumentPdf}=await import("./document-pdf.js");
const pdf=await createDocumentPdf({id:"synthetic-release-fixture",version:1,status:"draft",content:"Synthetic PDF export\n中文核对示例\nNo customer data."});
assert.ok(pdf.length>1000&&pdf.length<=8*1024*1024);assert.equal(pdf.subarray(0,5).toString(),"%PDF-");
const text=spawnSync("pdftotext",["-","-"],{input:pdf,encoding:"utf8",timeout:10000,maxBuffer:1048576});assert.equal(text.status,0);assert.ok(text.stdout.includes("Synthetic PDF export")&&text.stdout.includes("中文核对示例"));
const fonts=spawnSync("pdffonts",["-"],{input:pdf,encoding:"utf8",timeout:10000,maxBuffer:1048576});assert.equal(fonts.status,0);assert.match(fonts.stdout,/yes\s+yes\s+yes/);
console.log("Synthetic PDF worker and embedded Unicode font verified.");
})().catch(()=>{console.error("Synthetic PDF packaging smoke failed");process.exit(1);});' </dev/null
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


prepare_provider_security
check_provider_store || fail 'Provider configuration readiness failed before downtime'

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
backup_provider_ciphertext
[ "$(live_schema)" = 9 ] || fail 'Live database is not the reviewed schema9 predecessor'
private_operation backup --db /source/nestlet.sqlite --assets /source/assets --output /recovery/schema9 \
    || fail 'Private pre-upgrade backup failed; inspect private recovery evidence'
private_operation verify --input /recovery/schema9 || fail 'Private recovery point failed independent verification'
# The schema9 predecessor must also recognize this untouched rollback artifact.
docker run --rm --pull never --network none --read-only --cap-drop ALL \
    --security-opt no-new-privileges:true --pids-limit 64 --memory 768m --cpus 1 \
    --user 1000:1000 --mount "type=bind,source=$RECOVERY_DIR,target=/recovery,readonly" \
    "$OLD_IMAGE_ID" node scripts/private-data.js verify --input /recovery/schema9 \
    >>"$RECOVERY_DIR/operations.log" 2>&1 </dev/null || fail 'Predecessor rejected the schema9 recovery point'
# Public reviewed rehearsal code remains inside this private recovery directory.
cat > "$RECOVERY_DIR/schema10-recovery-rehearsal.mjs" <<'JS_REHEARSAL'
#!/usr/bin/env node
/**
 * Local, copy-only schema9 -> schema10 recovery checks. Node >=24 is required.
 * This file never chooses a host, changes Compose, restores live data, or deletes
 * evidence. Invoke it inside the already-reviewed network-disabled container.
 * Runtime and data paths must be explicit. The caller must pin the runtime image.
 * CLI errors are deliberately fixed-class: no rows, credentials, paths or hashes.
 *
 * migration  --runtime ROOT --snapshot BACKUP9 --output NEW_REHEARSAL
 * roundtrip  --runtime ROOT --source REHEARSAL --snapshot NEW_BACKUP10 --output NEW_RESTORE10
 * historical --runtime ROOT --snapshot BACKUP9 --output NEW_RESTORE9
 * future     --runtime ROOT --snapshot BACKUP9 --output NEW_FUTURE_COPY
 * predecessor --runtime OLD_ROOT --source RESTORE10
 *
 * Historical recovery keeps the WHOLE output directory, including its private
 * .service-reconfirm.json fence, until candidate startup consumes it after commit.
 * Never copy only its SQLite file. Expired telemetry causing startup pruning is a
 * retention failure here; it is not silently exempted from the preservation gate.
 */
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { closeSync, constants, existsSync, fstatSync, lstatSync, openSync, readSync,
  readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const APPLICATION_ID = 0x4e53544c;
const CLEARED = ['email_actions', 'auth_sessions', 'library_permissions'];
const ENTITIES = [
  ['client', 'clients', 'user_id'], ['case', 'cases', 'user_id'],
  ['asset', 'assets', 'owner_user_id'], ['artifact', 'artifacts', 'user_id'],
  ['conversation', 'conversations', 'user_id'], ['message', 'messages', 'user_id']
];
// Independent release inventory, not imported from the migration builder.
const NEW_OBJECTS = [
  ['index', 'service_usage_time'], ['index', 'service_usage_user_time'],
  ...['record_display_counters_1', 'record_display_ids_1', 'record_display_ids_2',
    'service_entitlement_audit_1', 'service_entitlements_1',
    'service_recovery_receipts_1', 'service_usage_1'].map(name => ['index', 'sqlite_autoindex_' + name]),
  ...['record_display_counters', 'record_display_ids', 'service_entitlement_audit',
    'service_entitlements', 'service_recovery_receipts', 'service_usage'].map(name => ['table', name]),
  ...ENTITIES.map(([, table]) => ['trigger', table + '_assign_display_id']),
  ...['record_display_id_no_delete', 'record_display_id_no_update', 'service_audit_no_delete',
    'service_audit_no_update', 'service_recovery_no_delete', 'service_recovery_no_update'].map(name => ['trigger', name])
];
const encode = value => JSON.stringify(value, (_, entry) => typeof entry === 'bigint' ? { integer: String(entry) } : entry);
const equal = (left, right) => encode(left) === encode(right);
const check = (condition, message) => {
  if (!condition) throw Object.assign(new Error(message), { code: 'SCHEMA10_REHEARSAL_FAILED' });
};
const quote = name => '"' + name.replaceAll('"', '""') + '"';
const load = (runtime, file) => import(pathToFileURL(join(resolve(runtime), file)).href);
const filenameIn = directory => join(directory, 'nestlet.sqlite');
const sortedObjects = rows => rows.map(row => encode(row)).sort();

function absolute(path) {
  check(typeof path === 'string' && resolve(path) === path, 'An absolute path is required');
}
function distinct(...paths) {
  paths.forEach(absolute);
  check(paths.every((path, index) => paths.every((other, otherIndex) =>
    index === otherIndex || (path !== other && !path.startsWith(other + sep) && !other.startsWith(path + sep)))),
  'Rehearsal paths must be separate directories');
}
function privateInfo(path, directory = false) {
  const info = lstatSync(path);
  check(!info.isSymbolicLink() && (directory ? info.isDirectory() : info.isFile()), 'Private evidence has an invalid type');
  check((info.mode & 0o777) === (directory ? 0o700 : 0o600), 'Private evidence permissions are invalid');
  check(info.uid === (process.geteuid?.() ?? process.getuid?.()), 'Private evidence ownership is invalid');
  if (!directory) check(info.nlink === 1, 'Private evidence link count is invalid');
  return info;
}
export function fileDigest(path) {
  privateInfo(path);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = fstatSync(fd);
    check(info.isFile() && info.nlink === 1 && (info.mode & 0o777) === 0o600, 'Private evidence changed while opening');
    const hash = createHash('sha256'), buffer = Buffer.alloc(131072);
    let length;
    while ((length = readSync(fd, buffer, 0, buffer.length, null))) hash.update(buffer.subarray(0, length));
    return hash.digest('hex');
  } finally { closeSync(fd); }
}
export function privateTree(directory) {
  absolute(directory);
  const rows = [];
  function visit(path, relative) {
    privateInfo(path, true);
    rows.push([relative, 'directory', 0o700]);
    for (const name of readdirSync(path).sort()) {
      const child = join(path, name), entry = relative ? relative + '/' + name : name;
      const info = lstatSync(child);
      if (info.isDirectory() && !info.isSymbolicLink()) visit(child, entry);
      else rows.push([entry, 'file', fileDigest(child)]);
    }
  }
  visit(directory, '');
  return rows;
}
function withDatabase(filename, callback) {
  privateInfo(filename);
  const db = new DatabaseSync(filename, { readOnly: true, allowExtension: false, timeout: 5000 });
  try { return callback(db); } finally { db.close(); }
}
function readRows(db, sql, ...params) {
  const statement = db.prepare(sql);
  statement.setReadBigInts(true);
  return statement.all(...params);
}
function rowDigest(db, table, where = '', parameters = []) {
  const statement = db.prepare('SELECT * FROM ' + quote(table) + where + ' ORDER BY rowid');
  statement.setReadBigInts(true);
  const hash = createHash('sha256'); let count = 0;
  for (const row of statement.iterate(...parameters)) { hash.update(encode(row) + '\n'); count++; }
  return { hash: hash.digest('hex'), count };
}
export function databaseSnapshot(filename) {
  return withDatabase(filename, db => {
    check(db.prepare('PRAGMA application_id').get().application_id === APPLICATION_ID, 'Database identity changed');
    check(db.prepare('PRAGMA integrity_check').get().integrity_check === 'ok', 'Database integrity failed');
    check(db.prepare('PRAGMA foreign_key_check').all().length === 0, 'Foreign key verification failed');
    const version = db.prepare('PRAGMA user_version').get().user_version;
    const schema = db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name').all();
    const tables = Object.fromEntries(schema.filter(row => row.type === 'table').map(({ name }) => [name, rowDigest(db, name)]));
    return { version, schema, tables,
      users: readRows(db, 'SELECT id,role FROM users ORDER BY id'),
      sequence: readRows(db, 'SELECT * FROM sqlite_sequence ORDER BY name'),
      entitlements: version === 10 ? readRows(db, 'SELECT * FROM service_entitlements ORDER BY user_id') : [],
      auditMax: version === 10 ? readRows(db, 'SELECT COALESCE(MAX(id),0) AS n FROM service_entitlement_audit')[0].n : 0n };
  });
}
function unchangedTables(before, after, exceptions = []) {
  for (const [name, digest] of Object.entries(before.tables)) {
    if (!exceptions.includes(name)) check(equal(after.tables[name], digest), 'Existing rows changed');
  }
}
function additiveSchema(before, after) {
  check(before.version === 9 && after.version === 10, 'Migration version is invalid');
  for (const row of before.schema) check(after.schema.some(candidate => equal(candidate, row)), 'Existing schema object changed');
  const old = new Set(before.schema.map(row => row.type + ':' + row.name));
  const additions = after.schema.filter(row => !old.has(row.type + ':' + row.name)).map(row => [row.type, row.name]);
  check(equal(sortedObjects(additions), sortedObjects(NEW_OBJECTS)), 'Unexpected schema10 objects');
}
function exactSchema(before, after) {
  check(before.version === after.version && equal(before.schema, after.schema), 'Schema changed during recovery');
}
function verifyDisplayBackfill(filename) {
  withDatabase(filename, db => {
    let expectedCount = 0;
    for (const [kind, table, owner] of ENTITIES) {
      const records = readRows(db, `SELECT id,${owner} AS owner FROM ${quote(table)} ORDER BY ${owner},created_at,id`);
      const counters = new Map();
      for (const row of records) {
        const number = (counters.get(row.owner) ?? 0n) + 1n; counters.set(row.owner, number);
        const found = readRows(db, 'SELECT number FROM record_display_ids WHERE owner_user_id=? AND kind=? AND record_id=?', row.owner, kind, row.id);
        check(found.length === 1 && found[0].number === number, 'Display reference backfill changed record scope or ordering');
      }
      const actual = readRows(db, 'SELECT owner_user_id,last_number FROM record_display_counters WHERE kind=? ORDER BY owner_user_id', kind);
      check(actual.length === counters.size && actual.every(row => counters.get(row.owner_user_id) === row.last_number), 'Display reference counter mismatch');
      expectedCount += records.length;
    }
    check(readRows(db, 'SELECT COUNT(*) AS n FROM record_display_ids')[0].n === BigInt(expectedCount), 'Unexpected display references');
  });
}
async function verifyAssets(runtime, directory, manifest) {
  const { openAssetVault } = await load(runtime, 'private-assets.js');
  const vault = openAssetVault({ directory: join(directory, 'assets') });
  for (const asset of manifest.assets) vault.read(asset);
  check(equal(readdirSync(vault.directory).sort(), manifest.assets.map(asset => asset.id + '.blob').sort()), 'Original asset inventory changed');
  privateTree(directory);
}
function clearedSecurity(after) {
  for (const name of CLEARED) check(after.tables[name]?.count === 0, 'Restored security capability survived');
}
function recoveryPause(before, after, filename) {
  const trial = before.users.filter(row => row.role === 'trial');
  const old = new Map(before.entitlements.map(row => [row.user_id, row]));
  const current = new Map(after.entitlements.map(row => [row.user_id, row]));
  withDatabase(filename, db => {
    const appended = readRows(db, 'SELECT * FROM service_entitlement_audit WHERE id>? ORDER BY id', before.auditMax);
    check(appended.length === trial.length, 'Recovery audit count is invalid');
    if (before.tables.service_entitlement_audit) check(equal(
      rowDigest(db, 'service_entitlement_audit', ' WHERE id<=?', [before.auditMax]),
      before.tables.service_entitlement_audit), 'Prior service audit changed');
    for (const user of trial) {
      const previous = old.get(user.id), value = current.get(user.id);
      const audit = appended.filter(row => row.target_user_id === user.id);
      check(value && audit.length === 1, 'Recovery did not pause every ordinary account');
      check(value.enabled === 0n && value.expires_at === (previous?.expires_at ?? null) &&
        value.requests_per_hour === (previous?.requests_per_hour ?? 10n) &&
        value.version === (previous?.version ?? 0n) + 1n, 'Recovery service state differs from pause policy');
      check(audit[0].actor_user_id === 'owner' && audit[0].source === 'recovery' && audit[0].enabled === 0n &&
        audit[0].expires_at === value.expires_at && audit[0].requests_per_hour === value.requests_per_hour &&
        audit[0].version === value.version && audit[0].created_at === value.updated_at &&
        Number.isFinite(Date.parse(value.updated_at)), 'Recovery audit differs from paused state');
    }
    const ids = new Set(trial.map(row => row.id));
    check(equal(before.entitlements.filter(row => !ids.has(row.user_id)), after.entitlements.filter(row => !ids.has(row.user_id))), 'Recovery changed a non-trial service');
    const auditSequence = before.sequence.find(row => row.name === 'service_entitlement_audit')?.seq;
    const expected = auditSequence ?? 0n;
    const actual = after.sequence.find(row => row.name === 'service_entitlement_audit')?.seq;
    // SQLite records a zero AUTOINCREMENT high-water mark even when this
    // INSERT ... SELECT finds no trial accounts. It is still the sole allowed sequence change.
    check(actual === expected + BigInt(trial.length), 'Recovery audit sequence changed unexpectedly');
    check(equal(before.sequence.filter(row => row.name !== 'service_entitlement_audit'),
      after.sequence.filter(row => row.name !== 'service_entitlement_audit')), 'Existing sequence changed');
  });
}
async function reopenUnchanged(runtime, directory) {
  const { openStorage } = await load(runtime, 'storage.js');
  const before = privateTree(directory);
  openStorage({ filename: filenameIn(directory) }).close();
  check(equal(privateTree(directory), before), 'Repeated startup changed recovered data');
}

export async function rehearseMigration({ runtime, snapshot, output }) {
  distinct(snapshot, output); check(!existsSync(output), 'Rehearsal output already exists');
  const { backupPrivateData, verifyPrivateBackup } = await load(runtime, 'scripts/private-data-operations.js');
  const checked = verifyPrivateBackup({ input: snapshot });
  check(checked.schemaVersion === 9, 'Migration requires a schema9 backup');
  const original = privateTree(snapshot), before = databaseSnapshot(filenameIn(snapshot));
  // Deliberately BACKUP, never restore: restore expires valid sessions and grants.
  await backupPrivateData({ filename: filenameIn(snapshot), assetsDirectory: join(snapshot, 'assets'), output });
  check(equal(databaseSnapshot(filenameIn(output)), before), 'Backup-of-backup changed data');
  check(!existsSync(filenameIn(output) + '.service-reconfirm.json'), 'Ordinary migration gained a recovery fence');
  const { openStorage } = await load(runtime, 'storage.js');
  openStorage({ filename: filenameIn(output) }).close();
  const after = databaseSnapshot(filenameIn(output));
  additiveSchema(before, after); unchangedTables(before, after);
  for (const name of ['service_entitlements', 'service_entitlement_audit', 'service_usage', 'service_recovery_receipts'])
    check(after.tables[name].count === 0, 'Ordinary migration unexpectedly changed service access');
  verifyDisplayBackfill(filenameIn(output));
  await verifyAssets(runtime, output, checked.manifest);
  await reopenUnchanged(runtime, output);
  verifyPrivateBackup({ input: snapshot });
  check(equal(privateTree(snapshot), original), 'Migration modified the original backup');
  return { verified: true, schemaVersion: 10 };
}

export async function rehearseRoundTrip({ runtime, source, snapshot, output }) {
  distinct(source, snapshot, output);
  check(!existsSync(snapshot) && !existsSync(output), 'Recovery output already exists');
  const { backupPrivateData, verifyPrivateBackup, restorePrivateBackup } = await load(runtime, 'scripts/private-data-operations.js');
  const original = privateTree(source), before = databaseSnapshot(filenameIn(source));
  check(before.version === 10, 'Round-trip requires schema10');
  await backupPrivateData({ filename: filenameIn(source), assetsDirectory: join(source, 'assets'), output: snapshot });
  const checked = verifyPrivateBackup({ input: snapshot }), backupTree = privateTree(snapshot);
  check(checked.schemaVersion === 10 && equal(databaseSnapshot(filenameIn(snapshot)), before), 'Backup changed schema10 data');
  const restored = await restorePrivateBackup({ input: snapshot, output });
  check(restored.verified && restored.schemaVersion === 10 && restored.serviceRecovery === 'paused-in-copy' && restored.preserveRestoreDirectory === true, 'Schema10 recovery contract changed');
  const after = databaseSnapshot(restored.filename);
  exactSchema(before, after);
  unchangedTables(before, after, [...CLEARED, 'service_entitlements', 'service_entitlement_audit', 'sqlite_sequence']);
  clearedSecurity(after); recoveryPause(before, after, restored.filename);
  check(!existsSync(restored.filename + '.service-reconfirm.json'), 'Schema10 restore gained a historical fence');
  await verifyAssets(runtime, output, checked.manifest);
  await reopenUnchanged(runtime, output);
  verifyPrivateBackup({ input: snapshot });
  check(equal(privateTree(snapshot), backupTree), 'Restore modified its backup');
  check(equal(privateTree(source), original), 'Round-trip modified its source');
  return { verified: true, schemaVersion: 10 };
}

export async function rehearseHistoricalRestore({ runtime, snapshot, output }) {
  distinct(snapshot, output); check(!existsSync(output), 'Historical recovery output already exists');
  const { restorePrivateBackup, verifyPrivateBackup } = await load(runtime, 'scripts/private-data-operations.js');
  const checked = verifyPrivateBackup({ input: snapshot });
  check(checked.schemaVersion === 9, 'Historical rehearsal requires schema9');
  const original = privateTree(snapshot), before = databaseSnapshot(filenameIn(snapshot));
  const restored = await restorePrivateBackup({ input: snapshot, output });
  check(restored.verified && restored.schemaVersion === 9 && restored.serviceRecovery === 'schema10-startup-fence' && restored.preserveRestoreDirectory === true, 'Historical recovery contract changed');
  const fenced = databaseSnapshot(restored.filename);
  exactSchema(before, fenced); unchangedTables(before, fenced, CLEARED); clearedSecurity(fenced);
  const marker = restored.filename + '.service-reconfirm.json';
  privateInfo(marker); privateTree(output);
  check(equal(readdirSync(output).sort(), ['assets', 'nestlet.sqlite', 'nestlet.sqlite.service-reconfirm.json']), 'Historical restore directory is incomplete');
  const { readServiceRecoveryFence } = await load(runtime, 'service-recovery.js');
  const fence = readServiceRecoveryFence(restored.filename);
  check(fence?.sourceSchema === 9 && fence.databaseSha256 === fileDigest(restored.filename), 'Historical fence does not match restored data');
  const { openStorage } = await load(runtime, 'storage.js');
  openStorage({ filename: restored.filename }).close();
  const after = databaseSnapshot(restored.filename);
  additiveSchema(fenced, after); unchangedTables(fenced, after, ['sqlite_sequence']);
  recoveryPause(fenced, after, restored.filename); verifyDisplayBackfill(restored.filename);
  check(after.tables.service_usage.count === 0, 'Historical recovery invented usage');
  withDatabase(restored.filename, db => {
    const receipts = readRows(db, 'SELECT * FROM service_recovery_receipts');
    check(receipts.length === 1 && receipts[0].recovery_id === fence.recoveryId && receipts[0].source_schema === 9n &&
      receipts[0].source_sha256 === fence.databaseSha256 && Number.isFinite(Date.parse(receipts[0].applied_at)), 'Historical recovery receipt is invalid');
  });
  check(!existsSync(marker) && !existsSync(restored.filename + '.service-reconfirm.lock'), 'Historical fence was not consumed after commit');
  await verifyAssets(runtime, output, checked.manifest);
  await reopenUnchanged(runtime, output);
  verifyPrivateBackup({ input: snapshot });
  check(equal(privateTree(snapshot), original), 'Historical recovery modified its backup');
  return { verified: true, schemaVersion: 10 };
}

export async function rehearseFutureRefusal({ runtime, snapshot, output }) {
  distinct(snapshot, output); check(!existsSync(output), 'Future check output already exists');
  const { backupPrivateData, verifyPrivateBackup, restorePrivateBackup } = await load(runtime, 'scripts/private-data-operations.js');
  const checked = verifyPrivateBackup({ input: snapshot });
  check(checked.schemaVersion === 9, 'Future check requires schema9 backup');
  const original = privateTree(snapshot);
  await backupPrivateData({ filename: filenameIn(snapshot), assetsDirectory: join(snapshot, 'assets'), output });
  // Only this newly created isolated copy receives the unsupported header.
  const db = new DatabaseSync(filenameIn(output));
  try { db.exec('PRAGMA user_version=11'); } finally { db.close(); }
  // Keep the isolated manifest internally consistent: restore must refuse the
  // unsupported version, rather than merely noticing a deliberately stale hash.
  const manifestPath = join(output, 'manifest.json'); privateInfo(manifestPath);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.schemaVersion = 11; manifest.databaseSha256 = fileDigest(filenameIn(output));
  writeFileSync(manifestPath, JSON.stringify(manifest) + '\n', {
    flag: constants.O_WRONLY | constants.O_TRUNC | constants.O_NOFOLLOW, mode: 0o600 });
  const before = privateTree(output), { openStorage } = await load(runtime, 'storage.js');
  let code;
  try { openStorage({ filename: filenameIn(output) }).close(); } catch (error) { code = error.code; }
  check(code === 'STORAGE_VERSION_UNSUPPORTED', 'Candidate accepted a future schema');
  check(equal(privateTree(output), before), 'Future startup refusal changed data');
  const rejected = output + '-rejected-backup'; check(!existsSync(rejected), 'Refusal target already exists');
  let failed = false;
  try { await backupPrivateData({ filename: filenameIn(output), assetsDirectory: join(output, 'assets'), output: rejected }); } catch { failed = true; }
  check(failed && !existsSync(rejected), 'Future backup was accepted or wrote output');
  const rejectedRestore = output + '-rejected-restore'; check(!existsSync(rejectedRestore), 'Restore refusal target already exists');
  failed = false;
  try { await restorePrivateBackup({ input: output, output: rejectedRestore }); } catch { failed = true; }
  check(failed && !existsSync(rejectedRestore), 'Invalid future snapshot was restored');
  check(equal(privateTree(output), before) && equal(privateTree(snapshot), original), 'Future refusal changed evidence');
  return { verified: true };
}

export async function rehearsePredecessorRefusal({ runtime, source }) {
  absolute(source); check(databaseSnapshot(filenameIn(source)).version === 10, 'Predecessor check requires schema10 copy');
  const before = privateTree(source), { openStorage } = await load(runtime, 'storage.js');
  let code;
  try { openStorage({ filename: filenameIn(source) }).close(); } catch (error) { code = error.code; }
  check(code === 'STORAGE_VERSION_UNSUPPORTED', 'Predecessor accepted schema10');
  check(equal(privateTree(source), before), 'Predecessor refusal changed data');
  return { verified: true };
}

const commands = {
  migration: [rehearseMigration, ['runtime', 'snapshot', 'output']],
  roundtrip: [rehearseRoundTrip, ['runtime', 'source', 'snapshot', 'output']],
  historical: [rehearseHistoricalRestore, ['runtime', 'snapshot', 'output']],
  future: [rehearseFutureRefusal, ['runtime', 'snapshot', 'output']],
  predecessor: [rehearsePredecessorRefusal, ['runtime', 'source']]
};
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const command = process.argv[2];
  try {
    check(Object.hasOwn(commands, command), 'Unknown rehearsal command');
    const [run, names] = commands[command], values = process.argv.slice(3), options = {};
    check(values.length === names.length * 2, 'Invalid rehearsal arguments');
    for (let i = 0; i < values.length; i += 2) {
      const name = values[i].slice(2);
      check(values[i].startsWith('--') && names.includes(name) && !Object.hasOwn(options, name), 'Invalid rehearsal argument');
      absolute(values[i + 1]); options[name] = values[i + 1];
    }
    check(names.every(name => Object.hasOwn(options, name)), 'Missing rehearsal argument');
    await run(options);
    process.stdout.write('Schema10 rehearsal passed.\n');
  } catch {
    process.stderr.write('Schema10 rehearsal failed; retain private evidence for operator review.\n');
    process.exitCode = 1;
  }
}

JS_REHEARSAL
chmod 600 "$RECOVERY_DIR/schema10-recovery-rehearsal.mjs"
chown 1000:1000 "$RECOVERY_DIR/schema10-recovery-rehearsal.mjs"
rehearsal() {
    local image="$1"; shift
    docker run --rm --pull never --network none --read-only --cap-drop ALL \
      --security-opt no-new-privileges:true --pids-limit 64 --memory 768m --cpus 1 \
      --user 1000:1000 --tmpfs /tmp:rw,noexec,nosuid,nodev,size=64m,mode=1777 \
      --mount "type=bind,source=$RECOVERY_DIR,target=/recovery" \
      "$image" node /recovery/schema10-recovery-rehearsal.mjs "$@" \
      >>"$RECOVERY_DIR/operations.log" 2>&1 </dev/null
}
rehearsal "$NEW_IMAGE_ID" migration --runtime /app --snapshot /recovery/schema9 --output /recovery/rehearsal || fail 'Strict schema10 migration preservation rehearsal failed'
rehearsal "$NEW_IMAGE_ID" roundtrip --runtime /app --source /recovery/rehearsal --snapshot /recovery/schema10-check --output /recovery/schema10-restored || fail 'Schema10 restore policy rehearsal failed'
rehearsal "$NEW_IMAGE_ID" historical --runtime /app --snapshot /recovery/schema9 --output /recovery/schema9-restored || fail 'Historical whole-directory recovery fence rehearsal failed'
rehearsal "$NEW_IMAGE_ID" future --runtime /app --snapshot /recovery/schema9 --output /recovery/future-check || fail 'Future-version refusal rehearsal failed'
rehearsal "$OLD_IMAGE_ID" predecessor --runtime /app --source /recovery/schema10-restored || fail 'Predecessor refusal rehearsal failed'
private_operation verify --input /recovery/schema9 || fail 'Recovery point changed during copy rehearsal'
echo 'Private schema9 recovery, strict schema10 preservation, current/historical restore policies and incompatible-version refusals passed.'
[ "$(docker image inspect --format '{{.Id}}' "nestlet:$NEW_SHA")" = "$NEW_IMAGE_ID" ] || fail 'Candidate image tag changed after validation'
set_image_tag "$OLD_SHA" "$NEW_SHA"
candidate_started=1
compose "$NEW_SHA" up -d --no-build --pull never --no-deps --force-recreate --wait --wait-timeout 90 nestlet
check_container "$NEW_SHA"
check_http true
check_helper_modules
check_persistent_mount "$NEW_SHA" 10
check_provider_store || fail 'Encrypted provider readiness failed after replacement'
switch_pointer "$OLD_RELEASE" "$NEW_RELEASE"
changed=0
trap - EXIT INT TERM HUP
echo "Nestlet updated to $NEW_SHA; existing configuration and dedicated data retained. Recovery points remain private. Authenticated browser and separately configured real-email delivery acceptance are still required."
