#!/usr/bin/env python3
"""Read-only Nestlet release receipt. No env, application rows or private paths are emitted.

Uses an existing shared maintenance lock without creating/truncating a file. SQLite
metadata is read from its 100-byte header only, never opened through a migrating
application or SQLite connection. WAL/journal/unstable headers are not reported as
verified schema metadata. No stop/start, image build/run, file write or migration.
"""
import fcntl
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys

BASE = Path('/opt/nestlet')
REPO = 'https://github.com/ledondev520/nestlet.git'
SHA = re.compile(r'[a-f0-9]{40}')

# These fixed paths are container-local; no host/source paths, rows or values are returned.
HEADER_CHECK = r'''
import {constants,openSync,readSync,closeSync,fstatSync,lstatSync} from "node:fs";
const path="/data/nestlet.sqlite";
const fail=()=>{throw Error("Private SQLite metadata unavailable");};
const privateMode=(entry,mode)=>entry.uid===process.geteuid()&&(entry.mode&0o777)===mode;
const dir=lstatSync("/data");if(!dir.isDirectory()||!privateMode(dir,0o700))fail();
const busy=()=>["-wal","-journal"].some(suffix=>{try{const info=lstatSync(path+suffix);return !info.isFile()||info.size!==0;}catch(error){if(error.code==="ENOENT")return false;throw error;}});
if(busy())fail();
const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
try{
  const initial=fstatSync(fd);if(!initial.isFile()||initial.nlink!==1||!privateMode(initial,0o600)||initial.size<100)fail();
  const header=Buffer.alloc(100),again=Buffer.alloc(100);
  if(readSync(fd,header,0,100,0)!==100||readSync(fd,again,0,100,0)!==100||!header.equals(again))fail();
  const final=fstatSync(fd),entry=lstatSync(path);
  if(initial.ino!==final.ino||initial.dev!==final.dev||initial.size!==final.size||initial.mtimeMs!==final.mtimeMs||entry.ino!==initial.ino||entry.dev!==initial.dev||busy())fail();
  if(!header.subarray(0,16).equals(Buffer.from("SQLite format 3\0"))||header[18]!==1||header[19]!==1)fail();
  console.log(JSON.stringify({schemaVersion:header.readUInt32BE(60),applicationIdentityValid:header.readUInt32BE(68)===0x4e53544c}));
}finally{closeSync(fd);}
'''


def require(condition):
    if not condition:
        raise RuntimeError('Unverified release metadata')


def command(arguments):
    env = dict(os.environ, DOCKER_HOST='unix:///var/run/docker.sock', GIT_OPTIONAL_LOCKS='0')
    env.pop('DOCKER_CONTEXT', None)
    result = subprocess.run(arguments, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                            stderr=subprocess.DEVNULL, text=True, env=env, timeout=15)
    require(result.returncode == 0 and len(result.stdout) <= 65536)
    return result.stdout.strip()


def private_directory(path, uid):
    info = path.lstat()
    require(stat.S_ISDIR(info.st_mode) and info.st_uid == uid and stat.S_IMODE(info.st_mode) == 0o700)


def current_commit(base, uid):
    current = base / 'current'
    require(current.is_symlink())
    # Read-only canonical comparison accepts absolute or relative references only
    # when they resolve to the same owned, non-symlink managed release directory.
    pointer_form = 'absolute' if os.path.isabs(os.readlink(current)) else 'relative'
    target = current.resolve(strict=True)
    require(target.parent == base / 'releases' and SHA.fullmatch(target.name))
    require(not (base / 'releases' / target.name).is_symlink())
    private_directory(target, uid)
    require(command(['git', '--no-optional-locks', '-C', str(target), 'remote', 'get-url', 'origin']) == REPO)
    require(command(['git', '--no-optional-locks', '-C', str(target), 'rev-parse', 'HEAD']) == target.name)
    require(command(['git', '--no-optional-locks', '-C', str(target), 'status', '--porcelain', '--untracked-files=all']) == '')
    return target.name, pointer_form


def inspect_container():
    ids = command(['docker', 'ps', '-aq', '--filter', 'label=com.docker.compose.project=nestlet']).split()
    require(len(ids) == 1 and re.fullmatch(r'[a-f0-9]{12,64}', ids[0]))
    fmt = ('{"image":{{json .Config.Image}},"imageId":{{json .Image}},'
           '"project":{{json (index .Config.Labels "com.docker.compose.project")}},'
           '"service":{{json (index .Config.Labels "com.docker.compose.service")}},'
           '"running":{{json .State.Running}},"health":{{json .State.Health.Status}},'
           '"readOnly":{{json .HostConfig.ReadonlyRootfs}},"ports":{{json .HostConfig.PortBindings}},'
           '"mounts":{{json .Mounts}}}')
    item = json.loads(command(['docker', 'inspect', '--format', fmt, ids[0]]))
    require(item['project'] == 'nestlet' and item['service'] == 'nestlet')
    require(item['readOnly'] is True)
    require(item['ports'] == {'4173/tcp': [{'HostIp': '127.0.0.1', 'HostPort': '4173'}]})
    require(re.fullmatch(r'nestlet:[a-f0-9]{40}', item['image']))
    require(re.fullmatch(r'sha256:[a-f0-9]{64}', item['imageId']))
    mounts = [entry for entry in item['mounts'] if entry['Type'] != 'tmpfs']
    require(len(mounts) == 1 and mounts[0]['Type'] == 'volume' and mounts[0]['Name'] == 'nestlet_case_data'
            and mounts[0]['Destination'] == '/data' and mounts[0]['RW'] is True)
    volume = json.loads(command(['docker', 'volume', 'inspect', 'nestlet_case_data', '--format', '{{json .}}']))
    require(volume['Name'] == 'nestlet_case_data' and volume['Driver'] == 'local' and not volume.get('Options'))
    labels = volume.get('Labels', {})
    require(labels.get('com.docker.compose.project') == 'nestlet'
            and labels.get('com.docker.compose.volume') == 'case_data'
            and labels.get('com.nestlet.purpose') == 'private-case-storage')
    tag_id = command(['docker', 'image', 'inspect', '--format', '{{.Id}}', item['image']])
    return ids[0], item, tag_id


def report(base=BASE):
    uid = os.geteuid()
    for directory in [base, base / 'releases', base / 'shared']:
        private_directory(directory, uid)
    marker = base / '.nestlet-managed'
    info = marker.lstat()
    require(stat.S_ISREG(info.st_mode) and info.st_uid == uid and info.st_nlink == 1 and info.st_size <= 64)
    require(marker.read_text().strip() == 'nestlet-managed-stage-v1')
    lock = base / '.incremental-release.lock'
    fd = os.open(lock, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        info = os.fstat(fd)
        require(stat.S_ISREG(info.st_mode) and info.st_uid == uid and info.st_nlink == 1 and stat.S_IMODE(info.st_mode) == 0o600)
        fcntl.flock(fd, fcntl.LOCK_SH | fcntl.LOCK_NB)
        commit, pointer_form = current_commit(base, uid)
        container, item, tag_id = inspect_container()
        metadata = {'schemaVersion': None, 'applicationIdentityValid': None}
        if item['running'] is True:
            # Busy/WAL/unreadable metadata stays unknown, never inferred from an image.
            try:
                observed = json.loads(command(['docker', 'exec', '--user', '1000:1000', container,
                                               'node', '--input-type=module', '-e', HEADER_CHECK]))
                require(type(observed.get('schemaVersion')) is int and 0 <= observed['schemaVersion'] <= 0x7fffffff)
                require(type(observed.get('applicationIdentityValid')) is bool)
                metadata = {key: observed[key] for key in metadata}
            except Exception:
                pass
        require(current_commit(base, uid) == (commit, pointer_form))
        # No tenant rows, credentials, image digests, container IDs or private paths.
        return {'verifiedCurrentCommit': commit, 'pointerForm': pointer_form,
                'imageCommitAgreement': item['image'] == 'nestlet:' + commit and item['imageId'] == tag_id,
                **metadata, 'healthy': item['running'] is True and item['health'] == 'healthy'}
    finally:
        os.close(fd)


if __name__ == '__main__':
    try:
        print(json.dumps(report(), sort_keys=True))
    except Exception:
        print('Read-only release identity inspection refused: metadata or maintenance lease could not be verified.', file=sys.stderr)
        sys.exit(1)
