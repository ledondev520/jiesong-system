import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import stat
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('snapshot', ROOT / 'backend/scripts/sqlite_snapshot.py')
snapshot = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(snapshot)


class SnapshotTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='jiesong-snapshot-test-')
        self.root = Path(self.temp.name)
        self.db = self.root / 'synthetic.db'
        self.connection = sqlite3.connect(self.db)
        self.connection.execute('PRAGMA journal_mode=WAL')
        self.connection.execute('CREATE TABLE balances (id TEXT PRIMARY KEY, quantity REAL)')
        self.connection.execute("INSERT INTO balances VALUES ('synthetic-opening',12.5)")
        self.connection.commit()

    def tearDown(self):
        self.connection.close()
        self.temp.cleanup()

    def save(self, keep=5):
        return snapshot.backup(self.db, self.root / 'backups', keep)

    def test_cli_requires_explicit_source_and_resolves_relative_prisma_url(self):
        command = ['node', 'scripts/db-backup.js', '--backup-dir', str(self.root / 'cli-backups')]
        environment = {'PATH': os.environ['PATH']}
        missing = subprocess.run(command, cwd=ROOT / 'backend', env=environment, capture_output=True)
        self.assertEqual(missing.returncode, 1)
        self.assertFalse((self.root / 'cli-backups').exists())
        environment['DATABASE_URL'] = 'file:' + os.path.relpath(self.db, ROOT / 'backend/prisma')
        saved = json.loads(subprocess.check_output(command, cwd=ROOT / 'backend', env=environment, text=True))
        target = self.root / 'cli-restored' / 'restored.db'
        result = json.loads(subprocess.check_output(['node', 'scripts/db-restore.js', '--backup', saved['backup'], '--database', str(target)], cwd=ROOT / 'backend', env=environment, text=True))
        self.assertEqual(result['sha256'], saved['sha256'])
        with sqlite3.connect(target) as reader:
            self.assertEqual(reader.execute('SELECT quantity FROM balances').fetchone()[0], 12.5)

    def test_cli_equals_options_override_environment_and_default_directory(self):
        other = self.root / 'other.db'
        with sqlite3.connect(other) as db:
            db.execute('CREATE TABLE sentinel (value TEXT)')
        folder = self.root / 'equals-backups'
        command = ['node', 'scripts/db-backup.js', '--database=' + str(self.db), '--backup-dir=' + str(folder)]
        environment = {'PATH': os.environ['PATH'], 'DATABASE_URL': other.as_uri()}
        saved = json.loads(subprocess.check_output(command, cwd=ROOT / 'backend', env=environment, text=True))
        self.assertEqual(Path(saved['backup']).parent, folder)
        with sqlite3.connect(saved['backup']) as db:
            self.assertEqual(db.execute('SELECT quantity FROM balances').fetchone()[0], 12.5)
        environment.pop('DATABASE_URL')
        subprocess.check_output(command, cwd=ROOT / 'backend', env=environment)

    def test_manifest_write_failure_does_not_leave_published_snapshot(self):
        for operation in ['json.dump', 'os.fsync']:
            with self.subTest(operation=operation):
                if operation == 'json.dump':
                    failure = patch.object(snapshot.json, 'dump', side_effect=OSError('synthetic full disk'))
                else:
                    real_sync = snapshot.os.fsync
                    calls = 0
                    def fail_manifest_sync(fd):
                        nonlocal calls
                        calls += 1
                        if calls == 2:
                            raise OSError('synthetic manifest fsync failure')
                        return real_sync(fd)
                    failure = patch.object(snapshot.os, 'fsync', side_effect=fail_manifest_sync)
                with failure, self.assertRaises(OSError):
                    self.save()
                self.assertEqual(list((self.root / 'backups').glob('snapshot_*')), [])

    def test_live_wal_backup_restore_preserves_committed_snapshot(self):
        self.assertGreater(Path(str(self.db) + '-wal').stat().st_size, 0)
        saved = self.save()
        self.connection.execute('UPDATE balances SET quantity=99')
        self.connection.commit()
        target = self.root / 'restored' / 'restored.db'
        result = snapshot.restore(saved['backup'], target)
        with sqlite3.connect(target) as restored:
            self.assertEqual(restored.execute('SELECT * FROM balances').fetchall(), [('synthetic-opening', 12.5)])
        self.assertEqual(self.connection.execute('SELECT quantity FROM balances').fetchone(), (99.0,))
        self.assertEqual(result['sha256'], saved['sha256'])
        for file in [Path(saved['backup']), Path(saved['manifest']), target]:
            self.assertEqual(stat.S_IMODE(file.stat().st_mode), 0o600)
        self.assertEqual(stat.S_IMODE(target.parent.stat().st_mode), 0o700)

    def test_verification_does_not_leave_temporary_wal_or_shm_files(self):
        saved = self.save()
        target = self.root / 'restored' / 'clean.db'
        snapshot.restore(saved['backup'], target)
        self.assertEqual(list((self.root / 'backups').glob('.snapshot-*')), [])
        self.assertEqual(list(target.parent.glob('.snapshot-*')), [])

    def test_restore_refuses_existing_target_without_modifying_it(self):
        saved = self.save()
        target = self.root / 'sentinel.db'; target.write_bytes(b'keep sentinel')
        with self.assertRaises(ValueError): snapshot.restore(saved['backup'], target)
        self.assertEqual(target.read_bytes(), b'keep sentinel')

    def test_restore_refuses_orphan_wal_instead_of_reading_old_data(self):
        saved = self.save()
        target = self.root / 'orphan.db'
        writer = sqlite3.connect(target)
        try:
            writer.execute('PRAGMA journal_mode=WAL')
            writer.execute('CREATE TABLE balances (id TEXT PRIMARY KEY, quantity REAL)')
            writer.execute("INSERT INTO balances VALUES ('synthetic-opening',99)")
            writer.commit()
            target.unlink()
            wal = Path(str(target) + '-wal')
            before = wal.read_bytes()
            with self.assertRaisesRegex(ValueError, 'sidecar'):
                snapshot.restore(saved['backup'], target)
            self.assertFalse(target.exists())
            self.assertEqual(wal.read_bytes(), before)
        finally:
            writer.close()

    def test_restore_refuses_each_existing_or_symlink_sidecar(self):
        saved = self.save()
        target = self.root / 'sidecars.db'
        for suffix in ['-wal', '-shm', '-journal']:
            for link in [False, True]:
                sidecar = Path(str(target) + suffix)
                if link:
                    sidecar.symlink_to(self.root / 'absent-sentinel')
                else:
                    sidecar.write_bytes(b'synthetic sentinel')
                with self.assertRaisesRegex(ValueError, 'sidecar'):
                    snapshot.restore(saved['backup'], target)
                self.assertFalse(target.exists())
                sidecar.unlink()

    def test_corrupt_backup_and_bad_manifest_never_create_restore_target(self):
        saved = self.save()
        target = self.root / 'restored' / 'bad.db'
        backup = Path(saved['backup'])
        with backup.open('ab') as handle: handle.write(b'corrupt')
        with self.assertRaises(ValueError): snapshot.restore(backup, target)
        self.assertFalse(target.exists())
        other = self.save()
        manifest = Path(other['manifest']); manifest.write_text('{}')
        with self.assertRaises(ValueError): snapshot.restore(other['backup'], target)
        self.assertFalse(target.exists())

    def test_retention_keeps_only_requested_managed_snapshot_pairs(self):
        folder = self.root / 'backups'; folder.mkdir(mode=0o700)
        sentinel = folder / 'other-file.db'; sentinel.write_text('keep')
        for _ in range(4): self.save(keep=2)
        self.assertEqual(len(list(folder.glob('snapshot_*.db'))), 2)
        self.assertEqual(len(list(folder.glob('snapshot_*.manifest.json'))), 2)
        self.assertEqual(sentinel.read_text(), 'keep')

    def test_missing_or_non_database_source_fails_without_successful_backup(self):
        with self.assertRaises(FileNotFoundError): snapshot.backup(self.root / 'missing.db', self.root / 'backups')
        invalid = self.root / 'invalid.db'; invalid.write_text('invalid')
        with self.assertRaises(sqlite3.DatabaseError): snapshot.backup(invalid, self.root / 'backups')
        self.assertFalse(list((self.root / 'backups').glob('snapshot_*.db')))

    def test_insecure_or_symlink_output_directory_is_rejected(self):
        folder = self.root / 'insecure'; folder.mkdir(mode=0o755)
        with self.assertRaises(ValueError): snapshot.backup(self.db, folder)
        self.assertEqual(stat.S_IMODE(folder.stat().st_mode), 0o755)
        link = self.root / 'link'; link.symlink_to(self.root, target_is_directory=True)
        with self.assertRaises(ValueError): snapshot.backup(self.db, link)


if __name__ == '__main__':
    unittest.main()
