/** Real HTTP/RBAC/SQLite coverage for POST /sales/:id/purchase-drafts (生成采购单); synthetic data only. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('HTTP/SQLite: generating purchase drafts is per-supplier, DRAFT-only, guarded and atomic', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-purchase-drafts-'));
  fs.chmodSync(directory, 0o700);
  const database = path.join(directory, 'synthetic.db');
  process.env.DATABASE_URL = `file:${database}`;
  process.env.UPLOAD_DIR = path.join(directory, 'uploads');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-only-purchase-drafts-never-for-production';
  let db, server;
  t.after(async () => {
    if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
    if (db) await db.$disconnect();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  // Committed migrations only (never db push); this also proves migration B1 applies cleanly.
  const migrations = path.resolve(__dirname, '../../prisma/migrations');
  const ddl = fs.readdirSync(migrations).sort()
    .filter((name) => fs.statSync(path.join(migrations, name)).isDirectory())
    .map((name) => fs.readFileSync(path.join(migrations, name, 'migration.sql'), 'utf8')).join('\n');
  execFileSync('python3', ['-c', 'import sqlite3,sys,os; os.umask(0o077); c=sqlite3.connect(sys.argv[1]); c.executescript(sys.stdin.read()); c.close()', database], { input: ddl });
  fs.chmodSync(database, 0o600);
  db = require('../utils/prisma');
  const jwt = require('jsonwebtoken');
  const tokens = {};
  for (const role of ['ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE', 'BOSS']) {
    const user = await db.user.create({ data: { username: `synthetic-drafts-${role}`, password: 'test-only-unused-hash', name: `合成${role}`, role } });
    tokens[role] = jwt.sign({ userId: user.id }, process.env.JWT_SECRET);
  }

  const port = await db.port.create({ data: { name: '合成采购港口', code: 'QA-DRAFT' } });
  const [storeA, storeB] = await Promise.all(['合成门店甲', '合成门店乙'].map((name) => db.store.create({ data: { name, portId: port.id } })));
  const [p1, p2] = await Promise.all(['合成商品一', '合成商品二'].map((customsName) => db.product.create({ data: { customsName, unit: '件' } })));
  const [supA, supB, supOff] = await Promise.all([
    db.supplier.create({ data: { name: '合成供应商甲' } }),
    db.supplier.create({ data: { name: '合成供应商乙' } }),
    db.supplier.create({ data: { name: '合成归档供应商', isActive: false } }),
  ]);
  const makeOrder = (contractNo, status, items) => db.salesContract.create({
    data: { contractNo, exchangeRate: 7.2, status, items: { create: items.map(([productId, storeId, quantity]) => ({ productId, storeId, quantity, unit: '件', costPrice: 0, sellingPrice: 1 })) } },
    include: { items: true },
  });
  const order = await makeOrder('EXP-SYN-001', 'CONFIRMED', [[p1.id, storeA.id, 10], [p1.id, storeB.id, 20], [p2.id, storeA.id, 5]]);
  const draftOrder = await makeOrder('EXP-SYN-002', 'DRAFT', [[p1.id, storeA.id, 1]]);
  const otherOrder = await makeOrder('EXP-SYN-003', 'CONFIRMED', [[p2.id, storeB.id, 3]]);
  const itemOf = (productId, storeId) => order.items.find((item) => item.productId === productId && item.storeId === storeId);

  const app = require('../app');
  server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const post = async (orderId, body, role = 'PURCHASE') => {
    const response = await fetch(`${base}/sales/${orderId}/purchase-drafts`, {
      method: 'POST',
      headers: { ...(tokens[role] ? { authorization: `Bearer ${tokens[role]}` } : {}), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: response.status, ...(await response.json()) };
  };
  const line = (item, supplierId, unitPrice = 12.5) => ({ salesItemId: item.id, supplierId, unitPrice });
  const counts = async () => ({ contracts: await db.purchaseContract.count(), items: await db.purchaseItem.count() });
  const valid = [line(itemOf(p1.id, storeA.id), supA.id), line(itemOf(p1.id, storeB.id), supA.id, 10), line(itemOf(p2.id, storeA.id), supB.id, 8)];

  // Roles: only ADMIN and PURCHASE may generate; anonymous 401.
  assert.equal((await post(order.id, { lines: valid }, 'ANONYMOUS')).status, 401);
  for (const role of ['SALES', 'FINANCE', 'WAREHOUSE', 'BOSS']) assert.equal((await post(order.id, { lines: valid }, role)).status, 403, role);

  // Validation: nothing is written for any rejected request.
  const rejected = [
    [order.id, { lines: [] }, 400],
    [order.id, {}, 400],
    [order.id, { lines: [line(itemOf(p1.id, storeA.id), supA.id, 0)] }, 400],
    [order.id, { lines: [{ ...line(itemOf(p1.id, storeA.id), supA.id), unitPrice: '12.5' }] }, 400],
    [order.id, { lines: [line(itemOf(p1.id, storeA.id), supA.id), line(itemOf(p1.id, storeA.id), supB.id)] }, 400],
    [order.id, { lines: [line(itemOf(p1.id, storeA.id), supOff.id)] }, 400],
    [order.id, { lines: [line(itemOf(p1.id, storeA.id), 'missing-supplier')] }, 400],
    [order.id, { lines: [line(otherOrder.items[0], supA.id)] }, 400],
    [draftOrder.id, { lines: [line(draftOrder.items[0], supA.id)] }, 400],
    ['missing-order', { lines: valid }, 404],
  ];
  for (const [orderId, body, status] of rejected) {
    assert.equal((await post(orderId, body)).status, status, JSON.stringify(body).slice(0, 80));
  }
  assert.deepEqual(await counts(), { contracts: 0, items: 0 });

  // Success: one DRAFT contract per supplier, per-line store, order link, shared amount helper.
  const ok = await post(order.id, { lines: valid }, 'ADMIN');
  assert.equal(ok.status, 201);
  assert.equal(ok.data.contracts.length, 2);
  assert.equal(new Set(ok.data.contracts.map((contract) => contract.contractNo)).size, 2);
  const stored = await db.purchaseContract.findMany({ include: { items: true }, orderBy: { contractNo: 'asc' } });
  assert.equal(stored.length, 2);
  for (const contract of stored) {
    assert.equal(contract.status, 'DRAFT', 'generated contracts are drafts, hence not payables');
    assert.equal(contract.salesContractId, order.id);
    assert.equal(contract.paidAmount, 0);
    assert.equal(contract.taxRate, 13);
    assert.match(contract.contractNo, /^CG\d{2}\d{5}$/);
  }
  const forA = stored.find((contract) => contract.supplierId === supA.id);
  const forB = stored.find((contract) => contract.supplierId === supB.id);
  assert.equal(forA.items.length, 2);
  assert.deepEqual(forA.items.map((item) => item.storeId).sort(), [storeA.id, storeB.id].sort());
  const aStoreA = forA.items.find((item) => item.storeId === storeA.id);
  assert.equal(aStoreA.quantity, 10);
  assert.equal(aStoreA.totalPrice, 141.25, '10 × 12.5 × 1.13 via the shared purchase amount helper');
  assert.equal(forA.totalAmount, 141.25 + 226, '20 × 10 × 1.13 = 226');
  assert.equal(forB.items.length, 1);
  assert.equal(forB.items[0].storeId, storeA.id);
  assert.equal(forB.totalAmount, 45.2);

  // A repeated (product, store) is a conflict; a different line of the same order may still be generated later.
  assert.equal((await post(order.id, { lines: [line(itemOf(p1.id, storeA.id), supB.id)] })).status, 409);
  assert.deepEqual(await counts(), { contracts: 2, items: 3 });
  const later = await post(otherOrder.id, { lines: [line(otherOrder.items[0], supB.id, 4)] });
  assert.equal(later.status, 201);
  // Cancelled contracts no longer block regeneration.
  await db.purchaseContract.update({ where: { id: forB.id }, data: { status: 'CANCELLED' } });
  assert.equal((await post(order.id, { lines: [line(itemOf(p2.id, storeA.id), supB.id)] })).status, 201);

  // Atomicity: a failure after the first contract was written rolls everything back.
  const before = await counts();
  const rollbackOrder = await makeOrder('EXP-SYN-004', 'CONFIRMED', [[p1.id, storeA.id, 2], [p2.id, storeB.id, 3]]);
  const { generatePurchaseDrafts } = require('../services/purchaseContractGenerationService');
  let itemWrites = 0;
  const failing = {
    $transaction: (work) => db.$transaction((tx) => work({
      salesContract: tx.salesContract,
      supplier: tx.supplier,
      purchaseContract: tx.purchaseContract,
      purchaseItem: {
        findMany: tx.purchaseItem.findMany.bind(tx.purchaseItem),
        createMany: async (args) => {
          itemWrites += 1;
          if (itemWrites === 2) throw new Error('synthetic write failure');
          return tx.purchaseItem.createMany(args);
        },
      },
    })),
  };
  await assert.rejects(generatePurchaseDrafts({
    salesContractId: rollbackOrder.id,
    lines: [line(rollbackOrder.items[0], supA.id), line(rollbackOrder.items[1], supB.id)],
    prismaClient: failing,
  }), /synthetic write failure/);
  assert.equal(itemWrites, 2, 'the first supplier group was written before the failure');
  assert.deepEqual(await counts(), before, 'no contract or item survives the failed transaction');
});
