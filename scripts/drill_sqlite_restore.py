#!/usr/bin/env python3
"""Run backup and restore CLIs against a newly created synthetic application database.

Requires an absent --directory. Leaves private databases and a JSON receipt for review.
Does not inspect .env, use seed credentials or connect to an existing database.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import stat
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', required=True, type=Path)
    args = parser.parse_args()
    os.umask(0o077)
    directory = args.directory.absolute()
    directory.mkdir(parents=True, exist_ok=False, mode=0o700)
    database = directory / 'synthetic-source.db'
    connection = sqlite3.connect(database)
    connection.execute('PRAGMA journal_mode=WAL')
    for migration in sorted((ROOT / 'backend/prisma/migrations').glob('*/migration.sql')):
        connection.executescript(migration.read_text())
    connection.execute("INSERT INTO products (id,customsName,unit,updatedAt) VALUES ('synthetic-product','合成恢复商品','件',CURRENT_TIMESTAMP)")
    connection.execute("INSERT INTO inventories (id,productId,quantity,unit,status,inboundAt,note,updatedAt) VALUES ('opening:SYN-DRILL','synthetic-product',12.5,'件','INBOUND','2026-01-01','synthetic drill only',CURRENT_TIMESTAMP)")
    connection.commit()
    assert Path(str(database) + '-wal').stat().st_size > 0
    rows = "SELECT id, productId, quantity, unit, status, note FROM inventories ORDER BY id"
    expected = connection.execute(rows).fetchall()
    environment = {key: value for key, value in os.environ.items() if key in ['PATH', 'LANG', 'LC_ALL']}
    # Prisma's file: paths preserve literal spaces/percent sequences.
    environment['DATABASE_URL'] = 'file:' + str(database)
    started = time.monotonic()
    backup_command = ['node', 'scripts/db-backup.js', '--backup-dir', str(directory / 'backups')]
    saved = json.loads(subprocess.check_output(backup_command, cwd=ROOT / 'backend', env=environment, text=True))
    connection.execute('UPDATE inventories SET quantity=99'); connection.commit()
    target = directory / 'restored' / 'restored.db'
    restore_command = ['node', 'scripts/db-restore.js', '--backup', saved['backup'], '--database', str(target)]
    restored = json.loads(subprocess.check_output(restore_command, cwd=ROOT / 'backend', env=environment, text=True))
    with sqlite3.connect(target) as reader:
        actual = reader.execute(rows).fetchall()
        integrity = reader.execute('PRAGMA integrity_check').fetchone()[0]
        foreign_keys = reader.execute('PRAGMA foreign_key_check').fetchall()
        assert reader.execute('SELECT COUNT(*) FROM users').fetchone()[0] == 0
    assert actual == expected
    assert integrity == 'ok' and foreign_keys == []
    assert connection.execute('SELECT quantity FROM inventories').fetchone()[0] == 99
    assert stat.S_IMODE(target.stat().st_mode) == 0o600
    assert stat.S_IMODE(target.parent.stat().st_mode) == 0o700
    receipt = {'status': 'PASS', 'synthetic_only': True, 'created_at': datetime.now(timezone.utc).isoformat(),
               'backup_command': backup_command, 'restore_command': restore_command,
               'backup': saved, 'restore': restored, 'expected_rows': expected, 'restored_rows': actual,
               'source_quantity_after_backup': 99, 'integrity': integrity, 'foreign_key_violations': foreign_keys,
               'restore_mode': '0600', 'restore_directory_mode': '0700',
               'duration_seconds': round(time.monotonic() - started, 3)}
    connection.close()
    (directory / 'receipt.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(receipt, ensure_ascii=False))


if __name__ == '__main__':
    main()
