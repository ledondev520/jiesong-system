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
