/** Archive script safety on synthetic private SQLite built from the committed migrations: target identity, backup, receipt. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { applyMigrations } = require('../testHelpers/financial-library-data');

const archive = require('../../scripts/archive-test-data');
const { PrismaClient } = require('@prisma/client');

function fixture(t, name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `archive-safety-${name}-`));
  fs.chmodSync(root, 0o700);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const database = path.join(root, 'synthetic.sqlite');
  applyMigrations(database);
  const backups = path.join(root, 'backups');
  fs.mkdirSync(backups, { mode: 0o700 });
  const client = new PrismaClient({ log: [], datasources: { db: { url: `file:${database}` } } });
  t.after(() => client.$disconnect());
  return { root, database, backups, client };
}

async function seed(db) {
  const port = await db.port.create({ data: { name: 'Synthetic port', code: 'SYN-P' } });
  return {
    supplier: await db.supplier.create({ data: { name: 'Synthetic doubtful supplier (存疑)' } }),
    keep: await db.supplier.create({ data: { name: 'Synthetic keep supplier' } }),
    store: await db.store.create({ data: { name: 'QA-Synthetic store', portId: port.id } }),
    product: await db.product.create({ data: { customsName: 'QA-Synthetic product' } }),
  };
}

const inactiveCount = async (db) => (await db.supplier.count({ where: { isActive: false } }))
  + (await db.store.count({ where: { isActive: false } })) + (await db.product.count({ where: { isActive: false } }));

test('refuses when the database Prisma opened differs from the configured target (nothing written, no receipt, no backup)', async (t) => {
  const a = fixture(t, 'a');
  const b = fixture(t, 'b');
  await seed(a.client);
  // DATABASE_URL points at B while the client is connected to A: the pre-write identity check must refuse.
  process.env.DATABASE_URL = `file:${b.database}`;
  const receipt = path.join(a.root, 'receipt.json');
  await assert.rejects(
    archive.main(['--confirm', '--backup-dir', a.backups, '--receipt', receipt], a.client),
    /私有文件或参数检查失败/,
  );
  assert.equal(await inactiveCount(a.client), 0, 'no archive write happened');
  assert.equal(fs.existsSync(receipt), false, 'the receipt is not even reserved');
  assert.deepEqual(fs.readdirSync(a.backups), [], 'no backup was taken');
  // A dry-run against the wrong target is refused too (it would show the wrong list).
  await assert.rejects(archive.main([], a.client), /私有文件或参数检查失败/);
});

test('confirm: private backup + exclusive 0600 receipt, one transaction, restore from the receipt', async (t) => {
  const a = fixture(t, 'ok');
  const rows = await seed(a.client);
  process.env.DATABASE_URL = `file:${a.database}`;
  const receipt = path.join(a.root, 'receipt.json');

  const applied = await archive.main(['--confirm', '--backup-dir', a.backups, '--receipt', receipt], a.client);
  assert.equal(applied.applied, true);
  assert.deepEqual(applied.counts, { suppliers: 1, stores: 1, products: 1 });
  assert.equal((await a.client.supplier.findUnique({ where: { id: rows.keep.id } })).isActive, true, 'unmarked supplier untouched');
  assert.equal((await a.client.supplier.findUnique({ where: { id: rows.supplier.id } })).isActive, false);

  const backups = fs.readdirSync(a.backups);
  assert.equal(backups.length, 1);
  assert.equal(fs.statSync(path.join(a.backups, backups[0])).mode & 0o777, 0o600);
  assert.equal(fs.statSync(receipt).mode & 0o777, 0o600);
  const saved = JSON.parse(fs.readFileSync(receipt, 'utf8'));
  assert.equal(saved.format, 'jiesong-archive-receipt-v1');
  assert.equal(saved.action, 'archive');
  assert.deepEqual(saved.plan.suppliers.map((r) => r.id), [rows.supplier.id]);
  assert.match(saved.targetFingerprint, /^[0-9a-f]{64}$/);

  // An existing receipt path is refused before any backup or write.
  await assert.rejects(archive.main(['--confirm', '--backup-dir', a.backups, '--receipt', receipt], a.client));
  assert.equal(fs.readdirSync(a.backups).length, 1);

  // Restore reads the private receipt and writes its own receipt.
  const restoreReceipt = path.join(a.root, 'restore-receipt.json');
  const restored = await archive.main(['--restore', receipt, '--confirm', '--backup-dir', a.backups, '--receipt', restoreReceipt], a.client);
  assert.deepEqual(restored.counts, { suppliers: 1, stores: 1, products: 1 });
  assert.equal(await inactiveCount(a.client), 0);
});

test('confirm with a non-private backup directory writes nothing', async (t) => {
  const a = fixture(t, 'perm');
  await seed(a.client);
  process.env.DATABASE_URL = `file:${a.database}`;
  fs.chmodSync(a.backups, 0o755);
  await assert.rejects(archive.main(['--confirm', '--backup-dir', a.backups, '--receipt', path.join(a.root, 'receipt.json')], a.client));
  assert.equal(await inactiveCount(a.client), 0);
  assert.deepEqual(fs.readdirSync(a.backups), []);
});
