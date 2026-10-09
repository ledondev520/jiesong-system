#!/usr/bin/env bash
# Read-only fixed Nestlet Compose normalization diagnostic. No restart or bootstrap.
set -euo pipefail
umask 077
readonly BASE=/opt/nestlet
readonly TARGET=1d6c2592118977455a29ed4e7d7c5b1153362d0c
[ "${1:-}" = "$TARGET" ] || exit 1
[ "$(id -u)" = 0 ] || exit 1
[ -f "$BASE/.incremental-release.lock" ] && [ ! -L "$BASE/.incremental-release.lock" ] || exit 1
exec 9<"$BASE/.incremental-release.lock"
flock -sn 9 || exit 1
python3 - <<'PY_GATE'
import pathlib,os,stat,hashlib
for path,mode in [('/opt/nestlet',0o700),('/opt/nestlet/shared',0o700),('/opt/nestlet/releases',0o700)]:
 s=os.lstat(path);assert stat.S_ISDIR(s.st_mode) and s.st_uid==0 and stat.S_IMODE(s.st_mode)==mode
for path in ['/opt/nestlet/shared/runtime.env','/opt/nestlet/shared/provider-compose.yaml']:
 s=os.lstat(path);assert stat.S_ISREG(s.st_mode) and s.st_uid==0 and s.st_nlink==1 and stat.S_IMODE(s.st_mode)==0o600
p=pathlib.Path('/opt/nestlet/shared/provider-compose.yaml');assert hashlib.sha256(p.read_bytes()).hexdigest()=='4bf85d3da4fbccbab4a3705d452b6625ad7274a95b64b676c6dd3691923f366a'
PY_GATE
[ "$(git -C "$BASE/releases/$TARGET" rev-parse HEAD)" = "$TARGET" ]
[ -z "$(git -C "$BASE/releases/$TARGET" status --porcelain --untracked-files=all)" ]
docker compose version --short | python3 -c 'import re,sys;s=sys.stdin.read().strip();assert re.fullmatch(r"v?[0-9]+[.][0-9]+[.][0-9]+(?:[-+][A-Za-z0-9.-]+)?",s);print("compose_version="+s)'
env -u PUBLIC_ORIGIN -u NESTLET_OPERATOR_USERNAME -u NESTLET_OPERATOR_PASSWORD_HASH -u DEEPSEEK_API_KEY -u DEEPSEEK_MODEL -u ENABLE_LIVE_AI \
 -u ALIBABA_CLOUD_ACCESS_KEY_ID -u ALIBABA_CLOUD_ACCESS_KEY_SECRET -u ALIBABA_CLOUD_SECURITY_TOKEN -u NESTLET_EMAIL_FROM \
 -u NESTLET_PROVIDER_WRAPPING_KEY_FILE -u NESTLET_PROVIDER_CONFIG_PATH \
 NESTLET_IMAGE_TAG="$TARGET" docker compose --project-name nestlet --env-file "$BASE/shared/runtime.env" -f "$BASE/releases/$TARGET/compose.yaml" -f "$BASE/shared/provider-compose.yaml" config --format json 2>/dev/null | python3 -c '
import json,sys
c=json.load(sys.stdin);assert set(c["services"])=={"nestlet"};s=c["services"]["nestlet"]
expected={"/provider-config":("/opt/nestlet/provider-config",False),"/run/nestlet-private/provider-wrapping.key":("/opt/nestlet/secrets/provider-wrapping.key",True)}
rows=[]
for m in s.get("volumes",[]):
 if m.get("target")=="/data":continue
 label=m.get("target") if m.get("target") in expected else "unexpected"
 source,ro=expected.get(label,(None,None));bind=m.get("bind",{})
 flag=bind.get("create_host_path","omitted") if isinstance(bind,dict) else "invalid"
 if type(flag) is not bool and flag!="omitted":flag="invalid"
 rows.append({"target":label,"type_matches":m.get("type")=="bind","source_matches":m.get("source")==source,"readonly_matches":m.get("read_only",False)==ro,"create_host_path":flag})
print(json.dumps({"mount_count":len(s.get("volumes",[])),"binds":rows,"overlay_exact":True},sort_keys=True))'
