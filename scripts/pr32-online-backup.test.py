import sqlite3
import stat
import tempfile
import unittest
from pathlib import Path
import importlib.util
_spec=importlib.util.spec_from_file_location('online_backup',Path(__file__).with_name('pr32-online-backup.py'))
_module=importlib.util.module_from_spec(_spec); _spec.loader.exec_module(_module)
snapshot=_module.snapshot

class SnapshotTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.source = self.root / 'source.db'
        self.db = sqlite3.connect(self.source)
        self.db.execute('CREATE TABLE synthetic (value TEXT)')
        self.db.commit()
        self.parent = self.root / 'protected'
        self.parent.mkdir(mode=0o700)
        self.out = self.parent / 'release'
    def tearDown(self):
        self.db.close()
        self.tmp.cleanup()
    def run_backup(self):
        return snapshot(str(self.source), str(self.out), 'a'*40)
    def test_wal_is_preserved_source_unchanged_and_permissions(self):
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('PRAGMA wal_autocheckpoint=0')
        self.db.execute("INSERT INTO synthetic VALUES ('synthetic-wal-row')")
        self.db.commit()
        self.assertTrue(Path(str(self.source)+'-wal').exists())
        before = self.source.read_bytes()
        before_wal = Path(str(self.source)+'-wal').read_bytes()
        result = self.run_backup()
        self.assertEqual(self.source.read_bytes(),before)
        self.assertEqual(Path(str(self.source)+'-wal').read_bytes(),before_wal)
        with sqlite3.connect(result['snapshot']) as copy:
            self.assertEqual(copy.execute('SELECT value FROM synthetic').fetchone()[0], 'synthetic-wal-row')
            self.assertEqual(copy.execute('PRAGMA journal_mode').fetchone()[0], 'delete')
        self.assertEqual(self.db.execute('PRAGMA journal_mode').fetchone()[0], 'wal')
        self.assertEqual(stat.S_IMODE(self.out.stat().st_mode), 0o700)
        for f in self.out.iterdir():
            self.assertEqual(stat.S_IMODE(f.stat().st_mode), 0o600)
        self.assertEqual(len(result['sha256']),64)
        self.assertFalse(result['writers_stopped'])
        self.assertEqual(result['status'],'snapshot_verified_only')
    def test_reject_existing_backup(self):
        self.run_backup()
        with self.assertRaises(FileExistsError): self.run_backup()
    def test_reject_symlink_source(self):
        link = self.root/'alias.db'; link.symlink_to(self.source)
        with self.assertRaises(ValueError): snapshot(str(link), str(self.out), 'a'*40)
    def test_reject_unprotected_parent(self):
        self.parent.chmod(0o755)
        with self.assertRaises(ValueError): self.run_backup()
    def test_requires_sha(self):
        with self.assertRaises(ValueError): snapshot(str(self.source),str(self.out),'main')
    def test_invalid_database_no_receipt(self):
        self.db.close(); self.source.write_text('not a database')
        with self.assertRaises(sqlite3.DatabaseError): self.run_backup()
        self.assertFalse((self.out/'receipt.json').exists())
    def test_relative_source(self):
        with self.assertRaises(ValueError): snapshot('source.db',str(self.out),'a'*40)

class OnlineConcurrencyTest(unittest.TestCase):
    def test_concurrent_transaction_pairs_remain_consistent(self):
        import threading
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); source=root/'live.db'; dest=root/'protected'; dest.mkdir(mode=0o700)
            with sqlite3.connect(source) as db:
                db.execute('PRAGMA journal_mode=WAL')
                db.execute('CREATE TABLE counters (id INTEGER PRIMARY KEY,value INTEGER)')
                db.executemany('INSERT INTO counters VALUES (?,0)',[(1,),(2,)])
                db.commit()
            active=threading.Event(); errors=[]
            def writer():
                try:
                    with sqlite3.connect(source) as db:
                        active.set()
                        for _ in range(100):
                            db.execute('BEGIN IMMEDIATE')
                            db.execute('UPDATE counters SET value=value+1 WHERE id=1')
                            db.execute('UPDATE counters SET value=value+1 WHERE id=2')
                            db.commit()
                except Exception as e: errors.append(type(e).__name__)
            thread=threading.Thread(target=writer); thread.start(); active.wait(5)
            result=snapshot(str(source),str(dest/'snapshot'),'a'*40)
            thread.join(10)
            self.assertFalse(thread.is_alive()); self.assertFalse(errors)
            with sqlite3.connect(result['snapshot']) as copy:
                values=copy.execute('SELECT value FROM counters ORDER BY id').fetchall()
                self.assertEqual(values[0],values[1])
                self.assertEqual(copy.execute('PRAGMA quick_check').fetchall(),[('ok',)])

if __name__ == '__main__': unittest.main()
