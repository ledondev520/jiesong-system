/** Real HTTP/RBAC/SQLite coverage for POST /sales/:id/items/:itemId/reprice (A84); synthetic data only. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('HTTP/SQLite: line re-price recomputes totals, audits every change, gates roles and locks shipped orders', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-reprice-'));
  fs.chmodSync(directory, 0o700);
  const database = path.join(directory, 'synthetic.db');
  process.env.DATABASE_URL = `file:${database}`;
  process.env.UPLOAD_DIR = path.join(directory, 'uploads');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-only-reprice-never-for-production';
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
  const tokens = {}; const users = {};
  for (const role of ['ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE', 'BOSS']) {
    users[role] = await db.user.create({ data: { username: `synthetic-reprice-${role}`, password: 'test-only-unused-hash', name: `合成${role}`, role } });
    tokens[role] = jwt.sign({ userId: users[role].id }, process.env.JWT_SECRET);
  }
  const port = await db.port.create({ data: { name: '合成港口', code: 'QA-RP' } });
  const store = await db.store.create({ data: { name: '合成门店', portId: port.id } });
  const product = await db.product.create({ data: { customsName: '合成商品', unit: '件' } });
  const makeOrder = (contractNo, status) => db.salesContract.create({
    data: { contractNo, exchangeRate: 7.2, status, items: { create: [
      { productId: product.id, storeId: store.id, quantity: 10, unit: '件', costPrice: 1, sellingPrice: 2 },
      { productId: product.id, storeId: store.id, quantity: 5, unit: '件', costPrice: 1, sellingPrice: 4 },
    ] } },
    include: { items: true },
  });
  const order = await makeOrder('EXP-RP-001', 'CONFIRMED');
  const app = require('../app');
  server = await new Promise((resolve) => { const l = app.listen(0, '127.0.0.1', () => resolve(l)); });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const post = async (orderId, itemId, body, role = 'SALES') => {
    const response = await fetch(`${base}/sales/${orderId}/items/${itemId}/reprice`, {
      method: 'POST',
      headers: { ...(tokens[role] ? { authorization: `Bearer ${tokens[role]}` } : {}), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: response.status, ...(await response.json()) };
  };
  const [a, b] = order.items;
  const logs = () => db.operationLog.findMany({ where: { entity: 'SalesItem', action: 'UPDATE_LINE' }, orderBy: { createdAt: 'asc' } });
  const total = async () => (await db.salesContract.findUnique({ where: { id: order.id } })).totalAmount;

  // Role gating: WAREHOUSE (OD-3, no amounts) and BOSS (read-only) are refused; anonymous 401; nothing written.
  assert.equal((await post(order.id, a.id, { sellingPrice: 3 }, 'ANONYMOUS')).status, 401);
  for (const role of ['WAREHOUSE', 'BOSS']) assert.equal((await post(order.id, a.id, { sellingPrice: 3 }, role)).status, 403, role);
  assert.equal((await logs()).length, 0);

  // Validation: nothing written.
  for (const body of [{}, { sellingPrice: 0 }, { sellingPrice: -1 }, { quantity: '5' }, { quantity: 0 }, { sellingPrice: null }]) {
    assert.equal((await post(order.id, a.id, body)).status, 400, JSON.stringify(body));
  }
  assert.equal((await post(order.id, 'missing-item', { quantity: 1 })).status, 404);
  assert.equal((await post('missing-order', a.id, { quantity: 1 })).status, 404);
  assert.equal((await logs()).length, 0);

  // Price change: total recomputed (10*3 + 5*4 = 50), one audit row with who/old/new.
  const priced = await post(order.id, a.id, { sellingPrice: 3 }, 'SALES');
  assert.equal(priced.status, 200);
  assert.equal(await total(), 50);
  // Quantity + price together: 8*3.5 + 5*4 = 48.
  assert.equal((await post(order.id, a.id, { quantity: 8, sellingPrice: 3.5 }, 'FINANCE')).status, 200);
  assert.equal(await total(), 48);
  // Same values -> no change, no audit row.
  assert.equal((await post(order.id, a.id, { quantity: 8, sellingPrice: 3.5 })).status, 200);
  const rows = await logs();
  assert.equal(rows.length, 2);
  assert.deepEqual([rows[0].userId, rows[1].userId], [users.SALES.id, users.FINANCE.id]);
  assert.deepEqual(JSON.parse(rows[0].oldValue), { salesContractId: order.id, sellingPrice: 2 });
  assert.deepEqual(JSON.parse(rows[0].newValue), { salesContractId: order.id, sellingPrice: 3 });
  assert.deepEqual(JSON.parse(rows[1].oldValue), { salesContractId: order.id, quantity: 10, sellingPrice: 3 });
  assert.deepEqual(JSON.parse(rows[1].newValue), { salesContractId: order.id, quantity: 8, sellingPrice: 3.5 });
  assert.ok(rows.every((row) => row.entityId === a.id));
  // Packing rows own the contract total: the response says so (UI hint), and the total stays put.
  assert.equal(priced.data.totalFromPacking, false);
  await db.packingItem.create({ data: { salesContractId: order.id, productId: product.id, storeId: store.id, quantity: 8, totalPrice: 777 } });
  await db.salesContract.update({ where: { id: order.id }, data: { totalAmount: 777 } });
  const withPacking = await post(order.id, a.id, { sellingPrice: 3.6 }, 'SALES');
  assert.equal(withPacking.status, 200);
  assert.equal(withPacking.data.totalFromPacking, true);
  assert.equal(await total(), 777);
  // An item of another order cannot be edited through this order.
  const other = await makeOrder('EXP-RP-002', 'DRAFT');
  assert.equal((await post(order.id, other.items[0].id, { quantity: 1 })).status, 404);

  // Locked states: shipped / arrived / completed / cancelled are immutable; nothing written.
  const before = (await logs()).length;
  for (const status of ['SHIPPED', 'ARRIVED', 'COMPLETED', 'CANCELLED']) {
    await db.salesContract.update({ where: { id: order.id }, data: { status } });
    assert.equal((await post(order.id, b.id, { sellingPrice: 9 }, 'ADMIN')).status, 400, status);
  }
  assert.equal((await logs()).length, before);
  assert.equal((await db.salesItem.findUnique({ where: { id: b.id } })).sellingPrice, 4);
  // An outbound inventory row locks the order even when the header status was reset.
  await db.salesContract.update({ where: { id: order.id }, data: { status: 'CONFIRMED' } });
  await db.inventory.create({ data: { productId: product.id, salesContractId: order.id, quantity: 1, status: 'OUTBOUND' } });
  assert.equal((await post(order.id, b.id, { sellingPrice: 9 }, 'ADMIN')).status, 400);
});
