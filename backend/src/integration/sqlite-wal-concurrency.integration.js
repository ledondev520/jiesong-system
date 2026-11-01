/**
 * Input: temporary SQLite database, two Prisma clients, an external writer holding the lock
 * Output: WAL is enabled and concurrent writers from separate clients/processes all succeed.
 * Pos: backend SQLite concurrency regression (worktree/temp DB only)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { execFileSync, spawn } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const { ensureWalJournal } = require('../utils/sqliteConcurrency');

const BACKEND_ROOT = path.resolve(__dirname, '../..');
const SCHEMA_PATH = path.join(BACKEND_ROOT, 'prisma', 'schema.prisma');
const PRISMA_BIN = path.join(BACKEND_ROOT, 'node_modules', '.bin', 'prisma');

const createTempDatabase = (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-wal-'));
  fs.chmodSync(dir, 0o700);
  const dbPath = path.join(dir, 'test.db');
  const ddl = execFileSync(PRISMA_BIN, ['migrate', 'diff', '--from-empty', '--to-schema-datamodel', SCHEMA_PATH, '--script'], {
    cwd: BACKEND_ROOT, env: { ...process.env, DATABASE_URL: `file:${dbPath}` }, encoding: 'utf8',
  });
  execFileSync('python3', ['-c', 'import sqlite3,sys,os; os.umask(0o077); c=sqlite3.connect(sys.argv[1]); c.executescript(sys.stdin.read()); c.close()', dbPath], { input: ddl });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dbPath, url: `file:${dbPath}` };
};

const writeConfig = (db, key) => db.systemConfig.create({ data: { key, value: 'v' } });

test('WAL is enabled once and persists for new connections; non-SQLite URLs are skipped', async (t) => {
  const { url } = createTempDatabase(t);
  const a = new PrismaClient({ datasources: { db: { url } }, log: [] });
  t.after(() => a.$disconnect());
  assert.equal(await ensureWalJournal(a, 'postgresql://x'), null);
  assert.equal(await ensureWalJournal(a, url), 'wal');
  const b = new PrismaClient({ datasources: { db: { url } }, log: [] });
  t.after(() => b.$disconnect());
  assert.equal((await b.$queryRawUnsafe('PRAGMA journal_mode'))[0].journal_mode, 'wal');
});

test('two writer clients interleave 40 writes with no lock errors', async (t) => {
  const { url } = createTempDatabase(t);
  const a = new PrismaClient({ datasources: { db: { url } }, log: [] });
  const b = new PrismaClient({ datasources: { db: { url } }, log: [] });
  t.after(() => Promise.all([a.$disconnect(), b.$disconnect()]));
  await ensureWalJournal(a, url);
  const jobs = [];
  for (let i = 0; i < 20; i += 1) jobs.push(writeConfig(a, `a${i}`), writeConfig(b, `b${i}`));
  await Promise.all(jobs);
  assert.equal(await a.systemConfig.count(), 40);
});

test('a write waits out a lock held by another process instead of failing', async (t) => {
  const { dbPath, url } = createTempDatabase(t);
  const db = new PrismaClient({ datasources: { db: { url } }, log: [] });
  t.after(() => db.$disconnect());
  await ensureWalJournal(db, url);
  const holder = spawn('python3', ['-c', 'import sqlite3,sys,time; c=sqlite3.connect(sys.argv[1], isolation_level=None); c.execute("BEGIN IMMEDIATE"); print("locked", flush=True); time.sleep(1.5); c.execute("COMMIT")', dbPath], { stdio: ['ignore', 'pipe', 'inherit'] });
  t.after(() => holder.kill());
  await new Promise((resolve) => holder.stdout.once('data', resolve));
  const started = Date.now();
  await writeConfig(db, 'waited');
  assert.ok(Date.now() - started >= 1000, 'write should have waited for the competing lock');
  assert.equal(await db.systemConfig.count(), 1);
});
