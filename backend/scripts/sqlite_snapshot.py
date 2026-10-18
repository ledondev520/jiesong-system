#!/usr/bin/env python3
"""Consistent SQLite snapshots and exclusive, verified restore to a new private path.

Uses Python's standard-library backup API, including committed WAL pages.
Never reads environment files. Existing restore targets are never overwritten.
"""
import argparse
from contextlib import closing
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import stat
import tempfile
import time
import uuid

SNAPSHOT_NAME = re.compile(r"snapshot_\d{8}T\d{12}Z_[a-f0-9]{8}\.db$")


def private_directory(path):
    path = Path(path).absolute()
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    info = path.lstat()
    if not stat.S_ISDIR(info.st_mode) or stat.S_IMODE(info.st_mode) & 0o077:
        raise ValueError("Output directory must be a real private directory with mode 0700")
    return path


def regular_file(path):
    path = Path(path).absolute()
    if not stat.S_ISREG(path.lstat().st_mode):
        raise ValueError("Input must be a regular file, not a symbolic link")
    return path


def digest(path):
    with path.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest() if hasattr(hashlib, "file_digest") else hash_stream(handle)


def hash_stream(handle):
    result = hashlib.sha256()
    for block in iter(lambda: handle.read(1024 * 1024), b""):
        result.update(block)
    return result.hexdigest()


def verify_database(path):
    with closing(sqlite3.connect(path.as_uri() + "?mode=ro", uri=True)) as connection:
        if connection.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
            raise ValueError("SQLite integrity check failed")


def sync_file(path):
    with path.open("rb") as handle:
        os.fsync(handle.fileno())


def sync_directory(path):
    descriptor = os.open(path, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def temporary_database(directory):
    descriptor, name = tempfile.mkstemp(prefix=".snapshot-", suffix=".tmp", dir=directory)
    os.fchmod(descriptor, 0o600)
    os.close(descriptor)
    return Path(name)


def backup(database, backup_dir, keep=5):
    if keep < 1:
        raise ValueError("Retention must be at least one")
    source = regular_file(database)
    directory = private_directory(backup_dir)
    temporary = temporary_database(directory)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    destination = directory / f"snapshot_{timestamp}_{uuid.uuid4().hex[:8]}.db"
    manifest = Path(str(destination) + ".manifest.json")
    linked = manifest_created = complete = False
    try:
        deadline = time.monotonic() + 60

        def progress(_status, _remaining, _total):
            if time.monotonic() > deadline:
                raise TimeoutError("Snapshot deadline exceeded")

        with closing(sqlite3.connect(source.as_uri() + "?mode=ro", uri=True)) as reader:
            with closing(sqlite3.connect(temporary)) as writer:
                reader.backup(writer, pages=256, progress=progress, sleep=0.05)
        verify_database(temporary)
        sync_file(temporary)
        metadata = {"version": 1, "created_at": timestamp, "sha256": digest(temporary),
                    "bytes": temporary.stat().st_size, "integrity": "ok", "sqlite_version": sqlite3.sqlite_version}
        os.link(temporary, destination)
        linked = True
        descriptor = os.open(manifest, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        manifest_created = True
        with os.fdopen(descriptor, "w", encoding="utf8") as handle:
            json.dump(metadata, handle, sort_keys=True, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        sync_directory(directory)
        complete = True
        snapshots = sorted((entry for entry in directory.iterdir()
                            if SNAPSHOT_NAME.fullmatch(entry.name)
                            and entry.is_file() and not entry.is_symlink()
                            and Path(str(entry) + ".manifest.json").is_file()), reverse=True)
        for old in snapshots[keep:]:
            old.unlink()
            Path(str(old) + ".manifest.json").unlink()
        return {"backup": str(destination), "manifest": str(manifest), **metadata}
    finally:
        if not complete:
            if manifest_created:
                manifest.unlink(missing_ok=True)
            if linked:
                destination.unlink(missing_ok=True)
        temporary.unlink(missing_ok=True)


def restore(backup_file, database):
    source = regular_file(backup_file)
    target = Path(database).absolute()
    if target.exists() or target.is_symlink():
        raise ValueError("Restore target already exists; restore to a new private path")
    directory = private_directory(target.parent)
    manifest = regular_file(str(source) + ".manifest.json")
    if stat.S_IMODE(source.stat().st_mode) & 0o077 or stat.S_IMODE(manifest.stat().st_mode) & 0o077:
        raise ValueError("Backup and manifest must have mode 0600")
    metadata = json.loads(manifest.read_text(encoding="utf8"))
    if metadata.get("version") != 1 or metadata.get("integrity") != "ok":
        raise ValueError("Unsupported snapshot manifest")
    temporary = temporary_database(directory)
    try:
        shutil.copyfile(source, temporary)
        if digest(temporary) != metadata["sha256"] or temporary.stat().st_size != metadata["bytes"]:
            raise ValueError("Snapshot checksum or size mismatch")
        verify_database(temporary)
        sync_file(temporary)
        os.link(temporary, target)
        sync_directory(directory)
        return {"restored": str(target), "sha256": metadata["sha256"], "bytes": metadata["bytes"], "integrity": "ok"}
    finally:
        temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    save = commands.add_parser("backup")
    save.add_argument("--database", required=True, type=Path)
    save.add_argument("--backup-dir", required=True, type=Path)
    save.add_argument("--keep", type=int, default=5)
    load = commands.add_parser("restore")
    load.add_argument("--backup", required=True, type=Path)
    load.add_argument("--database", required=True, type=Path)
    args = parser.parse_args()
    os.umask(0o077)
    try:
        result = backup(args.database, args.backup_dir, args.keep) if args.command == "backup" else restore(args.backup, args.database)
        print(json.dumps(result, sort_keys=True))
    except (OSError, ValueError, KeyError, sqlite3.Error, TimeoutError):
        parser.exit(1, "Snapshot failed: check explicit paths, private permissions, manifest/checksum and SQLite integrity. Existing databases were not replaced.\n")


if __name__ == "__main__":
    main()
