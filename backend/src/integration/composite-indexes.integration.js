/** P2-6 guard: all migrations, in order, leave the composite hot-path indexes in place.
 * Catches a later table rebuild (e.g. payments) silently dropping an index.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');

const EXPECTED = {
  inventories: [['productId', 'status', 'salesItemId', 'inboundAt']],
  payments: [['purchaseContractId', 'type', 'currency'], ['salesContractId', 'type', 'currency'], ['type', 'paymentDate']],
  bank_transactions: [['currency', 'matchStatus', 'direction'], ['currency', 'txnDate']],
  invoice_records: [['matchStatus', 'status', 'isPositive'], ['seller', 'status', 'isPositive']],
};

test('migrate deploy creates the composite indexes', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'composite-idx-'));
  fs.chmodSync(directory, 0o700);
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const dbPath = path.join(directory, 'idx.db');
  const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: path.resolve(__dirname, '../..'), encoding: 'utf8', timeout: 120000,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, DATABASE_URL: `file:${dbPath}` },
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

  const prisma = new PrismaClient({ datasourceUrl: `file:${dbPath}` });
  t.after(() => prisma.$disconnect());
  for (const [table, indexes] of Object.entries(EXPECTED)) {
    const actual = [];
    for (const ix of await prisma.$queryRawUnsafe(`PRAGMA index_list(${table})`)) {
      const cols = await prisma.$queryRawUnsafe(`PRAGMA index_info(${ix.name})`);
      actual.push(cols.map((c) => c.name).join(','));
    }
    for (const columns of indexes) {
      assert.ok(actual.includes(columns.join(',')), `${table} missing index on (${columns.join(', ')})`);
    }
  }
});
