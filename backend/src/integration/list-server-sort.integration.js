/** Real HTTP/SQLite coverage for A85 server-side sorting of the purchase-contract and inventory lists; synthetic data only. */
const test = require('node:test');
const { dbRole } = require('../testHelpers/od8Personas');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('HTTP/SQLite: sortBy/sortDir sort before pagination, compose with filters and reject unknown input', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-list-sort-'));
  fs.chmodSync(directory, 0o700);
  const database = path.join(directory, 'synthetic.db');
  process.env.DATABASE_URL = `file:${database}`;
  process.env.UPLOAD_DIR = path.join(directory, 'uploads');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-only-list-sort-never-for-production';
  let db, server;
  t.after(async () => {
    if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
    if (db) await db.$disconnect();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const migrations = path.resolve(__dirname, '../../prisma/migrations');
  const ddl = fs.readdirSync(migrations).sort()
    .filter((name) => fs.statSync(path.join(migrations, name)).isDirectory())
    .map((name) => fs.readFileSync(path.join(migrations, name, 'migration.sql'), 'utf8')).join('\n');
  execFileSync('python3', ['-c', 'import sqlite3,sys,os; os.umask(0o077); c=sqlite3.connect(sys.argv[1]); c.executescript(sys.stdin.read()); c.close()', database], { input: ddl });
  fs.chmodSync(database, 0o600);
  db = require('../utils/prisma');
  const jwt = require('jsonwebtoken');
  const tokens = {};
  for (const role of ['ADMIN', 'WAREHOUSE']) {
    const user = await db.user.create({ data: { username: `synthetic-sort-${role}`, password: 'test-only-unused-hash', name: `合成${role}`, role: dbRole(role) } });
    tokens[role] = jwt.sign({ userId: user.id }, process.env.JWT_SECRET);
  }
  const supplier = await db.supplier.create({ data: { name: '合成供应商' } });
  // Contract numbers are NOT in the same order as totals, so a per-page sort cannot pass by accident.
  const totals = { 'PC-1': 50, 'PC-2': 10, 'PC-3': 40, 'PC-4': 20, 'PC-5': 30 };
  for (const [contractNo, totalAmount] of Object.entries(totals)) {
    await db.purchaseContract.create({ data: { contractNo, supplierId: supplier.id, totalAmount, status: contractNo === 'PC-5' ? 'SIGNED' : 'DRAFT' } });
  }
  const product = await db.product.create({ data: { customsName: '合成商品', unit: '件' } });
  const quantities = [30, 10, 50, 20, 40];
  for (const quantity of quantities) await db.inventory.create({ data: { productId: product.id, quantity, status: 'INBOUND' } });

  const app = require('../app');
  server = await new Promise((resolve) => { const l = app.listen(0, '127.0.0.1', () => resolve(l)); });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const get = async (url, role = 'ADMIN') => {
    const response = await fetch(`${base}${url}`, { headers: { authorization: `Bearer ${tokens[role]}` } });
    return { status: response.status, ...(await response.json()) };
  };
  const pages = async (url, key, pageSize = 2) => {
    const out = [];
    for (let page = 1; page <= 3; page += 1) out.push(...(await get(`${url}&page=${page}&pageSize=${pageSize}`)).data.items.map((row) => row[key]));
    return out;
  };

  // Purchases: sorted across ALL pages, both directions, default unchanged.
  assert.deepEqual(await pages('/purchases?sortBy=totalAmount&sortDir=asc', 'totalAmount'), [10, 20, 30, 40, 50]);
  assert.deepEqual(await pages('/purchases?sortBy=totalAmount&sortDir=desc', 'totalAmount'), [50, 40, 30, 20, 10]);
  assert.deepEqual(await pages('/purchases?sortBy=contractNo', 'contractNo'), ['PC-1', 'PC-2', 'PC-3', 'PC-4', 'PC-5']);
  assert.deepEqual(await pages('/purchases?x=1', 'contractNo'), ['PC-5', 'PC-4', 'PC-3', 'PC-2', 'PC-1'], 'default stays contractNo desc');
  // Composes with a filter: total counts only filtered rows, sorted within them.
  const filtered = await get('/purchases?status=DRAFT&sortBy=totalAmount&sortDir=asc&page=1&pageSize=3');
  assert.equal(filtered.data.pagination.total, 4);
  assert.deepEqual(filtered.data.items.map((row) => row.totalAmount), [10, 20, 40]);
  // Inventory.
  assert.deepEqual(await pages('/inventory?sortBy=quantity&sortDir=desc', 'quantity'), [50, 40, 30, 20, 10]);
  assert.deepEqual(await pages('/inventory?sortBy=quantity&sortDir=asc', 'quantity'), [10, 20, 30, 40, 50]);
  // A83 columns (lot / bin) are sortable too.
  const stock = await db.inventory.findMany({ orderBy: { quantity: 'asc' } });
  for (const [index, row] of stock.entries()) {
    await db.inventory.update({ where: { id: row.id }, data: { lotNo: `LOT-${5 - index}`, binLocation: `BIN-${index}` } });
  }
  assert.deepEqual(await pages('/inventory?sortBy=lotNo&sortDir=asc', 'lotNo'), ['LOT-1', 'LOT-2', 'LOT-3', 'LOT-4', 'LOT-5']);
  assert.deepEqual(await pages('/inventory?sortBy=binLocation&sortDir=desc', 'binLocation'), ['BIN-4', 'BIN-3', 'BIN-2', 'BIN-1', 'BIN-0']);
  // Unknown column / direction -> 400 (never reaches Prisma); money columns closed to WAREHOUSE.
  assert.equal((await get('/purchases?sortBy=password')).status, 400);
  assert.equal((await get('/purchases?sortBy=totalAmount&sortDir=sideways')).status, 400);
  assert.equal((await get('/inventory?sortBy=__proto__')).status, 400);
  assert.equal((await get('/inventory?sortBy=constructor')).status, 400);
  assert.equal((await get('/inventory?sortBy=toString')).status, 400);
  assert.equal((await get('/inventory?sortBy[]=quantity')).status, 400);
  assert.equal((await get('/inventory?sortDir=asc')).status, 400);
  assert.equal((await get('/purchases?sortBy=totalAmount', 'WAREHOUSE')).status, 400);
  assert.equal((await get('/purchases?sortBy=contractNo', 'WAREHOUSE')).status, 200);
});
