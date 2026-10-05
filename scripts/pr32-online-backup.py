"""Protected online SQLite backup for the reviewed additive PR32 migration.
No migration, process changes, source journal changes, restores, or row logging.
"""
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import stat
import time
from contextlib import closing


def canonical(value):
    p = Path(value)
    if not p.is_absolute() or '..' in p.parts:
        raise ValueError('Absolute canonical path required')
    if any(x.is_symlink() for x in [p, *p.parents]):
        raise ValueError('Symlinks are not allowed')
    return p


def snapshot(source, directory, deployed_sha, verify_source=None):
    src, out = canonical(source), canonical(directory)
    if not src.is_file() or not src.stat().st_size:
        raise ValueError('Source must be a nonempty regular database')
    if len(deployed_sha) != 40 or any(c not in '0123456789abcdef' for c in deployed_sha):
        raise ValueError('Exact observed deployed SHA required')
    if not out.parent.is_dir() or out.parent.stat().st_uid != os.geteuid():
        raise ValueError('Protected parent must exist and belong to this user')
    if stat.S_IMODE(out.parent.stat().st_mode) != 0o700:
        raise ValueError('Backup parent must have mode 0700')
    initial_identity = (src.stat().st_dev, src.stat().st_ino)
    if verify_source is not None:
        verify_source(initial_identity)
    out.mkdir(mode=0o700)  # Exclusive: refuse all existing backup paths.
    os.chmod(out, 0o700)
    parent_fd = os.open(out.parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(parent_fd)
    finally:
        os.close(parent_fd)
    dst = out / 'pre-release.sqlite3'
    fd = os.open(dst, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    os.close(fd)
    started_at_unix = int(time.time())
    deadline = time.monotonic() + 120
    def progress(status, remaining, total):
        if time.monotonic() > deadline:
            raise TimeoutError('Snapshot timeout; no migration permitted')
    # mode=ro includes committed WAL; immutable=1 would be unsafe here.
    # Online backup reads a consistent SQLite snapshot, including committed WAL.
    # SQLite reader sidecar bookkeeping may change. No application/SQL source writes.
    with closing(sqlite3.connect(src.as_uri() + '?mode=ro', uri=True, timeout=5)) as source_db:
        with closing(sqlite3.connect(dst, timeout=5)) as target_db:
            source_db.backup(target_db, pages=256, progress=progress, sleep=0.1)
            if target_db.execute('PRAGMA journal_mode=DELETE').fetchone() != ('delete',):
                raise RuntimeError('Snapshot must be standalone')
            if target_db.execute('PRAGMA quick_check').fetchall() != [('ok',)]:
                raise RuntimeError('Snapshot integrity failure')
    if (src.stat().st_dev, src.stat().st_ino) != initial_identity:
        raise RuntimeError('Source identity changed during backup')
    if verify_source is not None:
        verify_source(initial_identity)
    os.chmod(dst, 0o600)
    with dst.open('rb') as f:
        hasher = hashlib.sha256()
        for block in iter(lambda: f.read(1024 * 1024), b''):
            hasher.update(block)
        digest = hasher.hexdigest()
        os.fsync(f.fileno())
    receipt = dict(status='snapshot_verified_only', source=str(src), snapshot=str(dst),
                   deployed_sha=deployed_sha, consistency='sqlite-online-backup-api',
                   writers_stopped=False, started_at_unix=started_at_unix,
                   completed_at_unix=int(time.time()), point_in_time_exact=False,
                   automatic_restore=False, later_writes_outside_snapshot=True,
                   bytes=dst.stat().st_size, sha256=digest,
                   verified_at_unix=int(time.time()), quick_check='ok')
    fd = os.open(out / 'receipt.json', os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as f:
        json.dump(receipt, f, sort_keys=True)
        f.flush()
        os.fsync(f.fileno())
    fd = os.open(out, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)
    return receipt


if __name__ == '__main__':
    import subprocess
    import sys
    try:
        os.umask(0o077)
        run_id = sys.argv[1]
        if not run_id.isdigit() or len(run_id) > 30:
            raise ValueError('Exact Actions run identifier required')
        expected_sha = '40efbaab2352a89b8dae8b4e4e4a1f8dc75eebdc'
        root = Path('/opt/jiesong-system')
        source = Path('/opt/jiesong_system/current/backend/prisma/dev.db')
        actual_sha = subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD'],
            text=True,timeout=10,stderr=subprocess.DEVNULL).strip()
        if actual_sha != expected_sha:
            raise ValueError('Deployed commit changed; re-inventory before backup')
        source = canonical(str(source))
        backend = (root / 'backend').resolve(strict=True)
        identity = (source.stat().st_dev, source.stat().st_ino)
        matches = 0
        for proc in Path('/proc').iterdir():
            if not proc.name.isdigit():
                continue
            try:
                if (proc / 'cwd').resolve(strict=True) != backend:
                    continue
                for fd in (proc / 'fd').iterdir():
                    try:
                        if os.readlink(fd) == str(source) and (fd.stat().st_dev,fd.stat().st_ino) == identity:
                            matches += 1
                            break
                    except FileNotFoundError:
                        pass
            except (FileNotFoundError, ProcessLookupError, PermissionError):
                pass
        if matches == 0:
            raise ValueError('No active backend process holds the inventoried database')
        parent = canonical('/opt/jiesong_system/release-backups')
        if not parent.exists():
            parent.mkdir(mode=0o700)  # No chmod of existing directories or source files.
            fd = os.open(parent.parent, os.O_RDONLY | os.O_DIRECTORY)
            try: os.fsync(fd)
            finally: os.close(fd)
        source_stat=source.stat()
        disk=os.statvfs(str(parent))
        if disk.f_bavail*disk.f_frsize < source_stat.st_size*2+64*1024*1024:
            raise RuntimeError('Insufficient backup safety margin')
        def verify_source(observed_identity):
            current_sha=subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD'],text=True,timeout=10,stderr=subprocess.DEVNULL).strip()
            if current_sha != expected_sha or observed_identity != identity:
                raise RuntimeError('Deployment or source identity changed')
        receipt = snapshot(str(source),str(parent / ('browser-session-' + run_id)),actual_sha,verify_source)
        print(json.dumps(receipt, sort_keys=True))
    except Exception as error:
        print(json.dumps({'status':'backup_failed','error_type':type(error).__name__,
            'action':'Do not merge or migrate; service remains unchanged. Incomplete artifacts retained protected.'}))
        raise SystemExit(1)
