/** Real HTTP/SQLite sales exception matrix; isolated synthetic users and records only. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('HTTP/SQLite: sales permissions, cancellations and forbidden lifecycle transitions', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-sales-exceptions-'));
  fs.chmodSync(directory, 0o700);
  const dbFile = path.join(directory, 'synthetic.db');
  process.env.DATABASE_URL = `file:${dbFile}`;
  process.env.UPLOAD_DIR = path.join(directory, 'uploads');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-only-sales-exception-secret-never-production';
  let db, server;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (db) await db.$disconnect();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const ddl = execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', path.resolve(__dirname, '../../prisma/schema.prisma'), '--script'], { encoding: 'utf8', timeout: 30000 });
  execFileSync('python3', ['-c', 'import sqlite3,sys,os; os.umask(0o077); c=sqlite3.connect(sys.argv[1]); c.executescript(sys.stdin.read()); c.close()', dbFile], { input: ddl });
  fs.chmodSync(dbFile, 0o600);
  db = require('../utils/prisma');
  const jwt = require('jsonwebtoken');
  const config = require('../config');
  const users = {};
  for (const role of ['SALES', 'PURCHASE', 'WAREHOUSE', 'BOSS', 'INACTIVE']) {
    const user = await db.user.create({ data: { username: `synthetic-exceptions-${role}`, password: 'test-only-unused-hash', name: `Synthetic ${role}`, role: role === 'INACTIVE' ? 'SALES' : role, isActive: role !== 'INACTIVE' } });
    users[role] = { id: user.id, token: jwt.sign({ userId: user.id, role: 'ADMIN' }, config.jwt.secret) };
  }
  const product = await db.product.create({ data: { customsName: 'SYNTHETIC SALES EXCEPTION WIDGET', unit: '件' } });
  const missingStockProduct = await db.product.create({ data: { customsName: 'SYNTHETIC MISSING STOCK WIDGET', unit: '件' } });
  const supplier = await db.supplier.create({ data: { name: 'Synthetic supplier' } });
  const port = await db.port.create({ data: { name: 'Synthetic port', code: 'EXCEPT' } });
  const store = await db.store.create({ data: { name: 'Synthetic store', portId: port.id } });
  const app = require('../app');
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const call = async (method, url, body, { role = 'SALES', expected = 200, key } = {}) => {
    const response = await fetch(base + url, { method, headers: { ...(role ? { authorization: `Bearer ${users[role].token}` } : {}), 'content-type': 'application/json', ...(key ? { 'X-Idempotency-Key': key } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const result = await response.json();
    assert.equal(response.status, expected, `${method} ${url}: ${result.message || result.error || ''}`);
    return result.data;
  };
  const createSale = body => call('POST', '/sales', { exchangeRate: 7.2, ...body }, { expected: 201 });
  const snapshot = async () => ({
    contracts: await db.salesContract.findMany({ orderBy: { id: 'asc' } }),
    items: await db.salesItem.findMany({ orderBy: { id: 'asc' } }),
    packing: await db.packingItem.findMany({ orderBy: { id: 'asc' } }),
    inventory: await db.inventory.findMany({ orderBy: { id: 'asc' } }),
    payments: await db.payment.findMany({ orderBy: { id: 'asc' } }),
    receipts: await db.purchaseReceipt.findMany({ orderBy: { id: 'asc' } }),
    inspections: await db.purchaseReceiptInspection.findMany({ orderBy: { id: 'asc' } }),
  });
  const cargo = (quantity = 50, productId = product.id) => ({ productId, storeId: store.id, quantity, unit: '件', boxes: 5, grossWeight: 20000, netWeight: 19000, volume: 5, length: 1000, width: 1000, height: 1000, unitPrice: 3 });

  await t.test('permission denials use live user identity and leave business rows unchanged', async () => {
    const purchaseResult = await call('POST', '/purchases', { supplierId: supplier.id, taxRate: 13, items: [{ productId: product.id, quantity: 100, unit: '件', unitPrice: 10 }] }, { role: 'PURCHASE', expected: 201 });
    const purchase = purchaseResult.contract || purchaseResult;
    const before = await snapshot();
    for (const [method, url, body, role, expected] of [
      ['POST', '/sales', { exchangeRate: 7.2 }, null, 401],
      ['POST', '/sales', { exchangeRate: 7.2 }, 'INACTIVE', 401],
      ['POST', '/sales', { exchangeRate: 7.2 }, 'BOSS', 403],
      ['POST', `/purchases/${purchase.id}/receipts`, { requestId: 'synthetic-denied-receipt', items: [{ purchaseItemId: purchase.items[0].id, arrivedQuantity: 100 }] }, 'SALES', 403],
      ['POST', `/purchases/${purchase.id}/receipts/synthetic-receipt/inspection`, { requestId: 'synthetic-denied-inspection', items: [] }, 'SALES', 403],
      ['GET', '/finance/statements/evidence/documents', undefined, 'SALES', 403],
      ['GET', '/tax-refunds/workbench/synthetic-sale/preparation', undefined, 'SALES', 403],
      ['POST', '/auth/register', { username: 'synthetic-denied-admin' }, 'SALES', 403],
    ]) await call(method, url, body, { role, expected });
    assert.deepEqual(await snapshot(), before);
  });

  await t.test('canonical status rejects draft shipment, arrival, settlement and unknown states', async () => {
    const sale = await createSale();
    const before = await snapshot();
    for (const status of ['SHIPPED', 'ARRIVED', 'COMPLETED', 'NOT_A_STATUS']) {
      await call('PUT', `/sales/${sale.id}/status`, { status }, { expected: 400 });
      assert.deepEqual(await snapshot(), before);
    }
  });

  await t.test('legacy status endpoint cannot skip shipment, arrival or settlement validation', async () => {
    for (const status of ['SHIPPED', 'ARRIVED', 'COMPLETED', 'NOT_A_STATUS']) {
      const sale = await createSale();
      const before = await snapshot();
      await call('PUT', `/containers/${sale.id}/status`, { status }, { expected: 400 });
      assert.deepEqual(await snapshot(), before);
    }
  });

  await t.test('legacy header edit cannot bypass state validation or partially save other fields', async () => {
    const sale = await createSale({ note: 'original synthetic note' });
    const before = await snapshot();
    await call('PUT', `/containers/${sale.id}`, { status: 'SHIPPED', note: 'must roll back' }, { expected: 400 });
    assert.deepEqual(await snapshot(), before);
    const saved = await call('PUT', `/containers/${sale.id}`, { status: 'draft', note: 'updated synthetic metadata' });
    assert.equal(saved.status, 'DRAFT');
    assert.equal(saved.note, 'updated synthetic metadata');
  });

  await t.test('legacy creation cannot fabricate an already shipped or settled empty contract', async () => {
    for (const status of ['SHIPPED', 'ARRIVED', 'COMPLETED', 'NOT_A_STATUS']) {
      const before = await snapshot();
      await call('POST', '/containers', { portId: port.id, status }, { expected: 400 });
      assert.deepEqual(await snapshot(), before);
    }
    assert.equal((await call('POST', '/containers', { portId: port.id }, { expected: 201 })).status, 'DRAFT');
  });

  await t.test('cancel retry stays cancelled and creation replay never revives it', async () => {
    const payload = { exchangeRate: 7.2, items: [{ productId: product.id, storeId: store.id, quantity: 1, costPrice: 10, sellingPrice: 3 }] };
    const sale = await call('POST', '/sales', payload, { expected: 201, key: 'synthetic-cancel-retry' });
    await call('PUT', `/sales/${sale.id}/status`, { status: 'CANCELLED' });
    await call('PUT', `/sales/${sale.id}/status`, { status: 'CANCELLED' });
    const before = await snapshot();
    const replay = await call('POST', '/sales', payload, { expected: 201, key: 'synthetic-cancel-retry' });
    assert.equal(replay.id, sale.id);
    assert.equal(replay.status, 'CANCELLED');
    assert.equal(replay.idempotentReplay, true);
    await call('POST', '/sales', { ...payload, note: 'changed' }, { expected: 409, key: 'synthetic-cancel-retry' });
    for (const root of ['sales', 'containers']) {
      for (const status of ['CONFIRMED', 'SHIPPED', 'ARRIVED', 'COMPLETED']) {
        await call('PUT', `/${root}/${sale.id}/status`, { status }, { expected: 400 });
      }
    }
    assert.deepEqual(await snapshot(), before);
  });

  await t.test('multi-product shortage rolls back earlier allocations and shipment timestamp', async () => {
    await db.inventory.create({ data: { productId: product.id, quantity: 50, unit: '件', status: 'INBOUND', inboundAt: new Date('2026-10-01') } });
    const sale = await createSale();
    await call('POST', `/sales/${sale.id}/packing-items`, { ...cargo(50), grossWeight: 10000 }, { expected: 201 });
    await call('POST', `/sales/${sale.id}/packing-items`, { ...cargo(1, missingStockProduct.id), grossWeight: 10000 }, { expected: 201 });
    await call('PUT', `/sales/${sale.id}/status`, { status: 'CONFIRMED' });
    const before = await snapshot();
    for (const root of ['sales', 'containers']) {
      await call('PUT', `/${root}/${sale.id}/status`, { status: 'SHIPPED' }, { expected: 400 });
      assert.deepEqual(await snapshot(), before);
    }
  });

  await t.test('legacy valid shipment deducts stock once; competing sale cannot oversell or reverse it', async () => {
    const sharedProduct = await db.product.create({ data: { customsName: 'SYNTHETIC OVERSELL WIDGET', unit: '件' } });
    await db.inventory.create({ data: { productId: sharedProduct.id, quantity: 100, unit: '件', status: 'INBOUND', inboundAt: new Date('2026-10-01') } });
    const a = await createSale(), b = await createSale();
    for (const sale of [a, b]) {
      await call('POST', `/sales/${sale.id}/packing-items`, cargo(60, sharedProduct.id), { expected: 201 });
      assert.equal((await call('PUT', `/containers/${sale.id}/status`, { status: 'CONFIRMED' })).status, 'PACKING');
    }
    const shipped = await call('PUT', `/containers/${a.id}/status`, { status: 'SHIPPED' });
    let before = await snapshot();
    assert.equal(before.inventory.filter(row => row.productId === sharedProduct.id && row.status === 'OUTBOUND').reduce((sum, row) => sum + row.quantity, 0), 60);
    assert.equal(before.inventory.filter(row => row.productId === sharedProduct.id && row.status === 'INBOUND').reduce((sum, row) => sum + row.quantity, 0), 40);
    for (const root of ['sales', 'containers']) {
      const replay = await call('PUT', `/${root}/${a.id}/status`, { status: 'SHIPPED' });
      assert.equal(replay.shippedAt, shipped.shippedAt);
      assert.deepEqual((await snapshot()).inventory, before.inventory);
      await call('PUT', `/${root}/${b.id}/status`, { status: 'SHIPPED' }, { expected: 400 });
      for (const status of ['DRAFT', 'CANCELLED', 'COMPLETED']) {
        await call('PUT', `/${root}/${a.id}/status`, { status }, { expected: 400 });
      }
    }
    assert.equal((await db.salesContract.findUnique({ where: { id: b.id } })).status, 'PACKING');
    assert.equal((await db.salesContract.findUnique({ where: { id: b.id } })).shippedAt, null);
    await call('PUT', `/containers/${a.id}`, { status: 'DRAFT', note: 'must not reverse' }, { expected: 400 });
    const edited = await call('PUT', `/containers/${a.id}`, { status: 'SHIPPED', note: 'permitted synthetic metadata' });
    assert.equal(edited.status, 'SHIPPED');
    assert.deepEqual((await snapshot()).inventory, before.inventory);
    assert.equal((await call('PUT', `/containers/${a.id}/status`, { status: 'ARRIVED' })).status, 'ARRIVED');
    for (const root of ['sales', 'containers']) {
      await call('PUT', `/${root}/${a.id}/status`, { status: 'COMPLETED' }, { expected: 400 });
    }
    assert.deepEqual((await snapshot()).inventory, before.inventory);
    // This records a synthetic internal receipt; no payment provider is contacted.
    await call('POST', '/finance/payments', { type: 'RECEIVABLE_COLLECTION', salesContractId: a.id, amount: 180, currency: 'USD', paymentDate: '2026-10-01' }, { expected: 201 });
    assert.equal((await db.salesContract.findUnique({ where: { id: a.id } })).status, 'COMPLETED');
    before = await snapshot();
    assert.equal((await call('PUT', `/containers/${a.id}/status`, { status: 'COMPLETED' })).status, 'COMPLETED');
    assert.deepEqual((await snapshot()).inventory, before.inventory);
    await call('PUT', `/containers/${a.id}/status`, { status: 'SHIPPED' }, { expected: 400 });
    await call('PUT', `/containers/${a.id}/status`, { status: 'CANCELLED' }, { expected: 400 });
  });

  await t.test('legacy OUT_STOCK shipment replay preserves the existing allocation and timestamp', async () => {
    const legacyProduct = await db.product.create({ data: { customsName: 'SYNTHETIC ALIAS RETRY WIDGET', unit: '件' } });
    await db.inventory.create({ data: { productId: legacyProduct.id, quantity: 200, unit: '件', status: 'INBOUND', inboundAt: new Date('2026-10-01') } });
    const sale = await createSale();
    await call('POST', `/sales/${sale.id}/packing-items`, cargo(60, legacyProduct.id), { expected: 201 });
    await call('PUT', `/sales/${sale.id}/status`, { status: 'CONFIRMED' });
    const original = await call('PUT', `/sales/${sale.id}/status`, { status: 'SHIPPED' });
    // Simulate a persisted pre-normalization alias, keeping real outbound evidence.
    await db.salesContract.update({ where: { id: sale.id }, data: { status: 'OUT_STOCK' } });
    const before = (await snapshot()).inventory;
    for (const root of ['sales', 'containers']) {
      await db.salesContract.update({ where: { id: sale.id }, data: { status: 'OUT_STOCK' } });
      const replay = await call('PUT', `/${root}/${sale.id}/status`, { status: 'SHIPPED' });
      const actual = (await snapshot()).inventory;
      assert.equal(actual.filter(row => row.productId === legacyProduct.id && row.status === 'OUTBOUND').reduce((sum, row) => sum + row.quantity, 0), 60, 'OUT_STOCK is already SHIPPED; replay must not allocate another 60 units');
      assert.equal(replay.shippedAt, original.shippedAt);
      assert.equal(replay.status, 'SHIPPED');
      assert.deepEqual(actual, before);
    }
  });

  await t.test('unchanged legacy custom-state metadata stays editable without permitting a transition', async () => {
    const sale = await createSale();
    await db.salesContract.update({ where: { id: sale.id }, data: { status: 'CUSTOM_LEGACY' } });
    const edited = await call('PUT', `/containers/${sale.id}`, { status: 'custom_legacy', note: 'synthetic historical metadata' });
    assert.equal(edited.status, 'CUSTOM_LEGACY');
    assert.equal(edited.note, 'synthetic historical metadata');
    const before = await snapshot();
    await call('PUT', `/containers/${sale.id}`, { status: 'SHIPPED', note: 'must not bypass' }, { expected: 400 });
    await call('PUT', `/containers/${sale.id}/status`, { status: 'SHIPPED' }, { expected: 400 });
    assert.deepEqual(await snapshot(), before);
  });

  await t.test('third-party-only legacy cargo ships without consuming owned stock or sales-item fallback', async () => {
    const sale = await createSale({ items: [{ productId: missingStockProduct.id, storeId: store.id, quantity: 10, costPrice: 10, sellingPrice: 3 }] });
    // Ownership is historical packing evidence, not a mocked authorization result.
    await db.packingItem.create({ data: { salesContractId: sale.id, ...cargo(50, missingStockProduct.id), totalPrice: 150, isOwnedByJiesong: false, sourceParty: 'Synthetic third-party cargo owner' } });
    await db.salesContract.update({ where: { id: sale.id }, data: { grossWeight: 20000, volume: 5, totalBoxes: 5, totalAmount: 150 } });
    const before = (await snapshot()).inventory;
    await call('PUT', `/containers/${sale.id}/status`, { status: 'CONFIRMED' });
    const shipped = await call('PUT', `/containers/${sale.id}/status`, { status: 'SHIPPED' });
    assert.equal(shipped.status, 'SHIPPED');
    assert.deepEqual((await snapshot()).inventory, before);
    assert.equal((await call('GET', `/sales/${sale.id}`)).hasThirdPartyCargo, true);
    const replay = await call('PUT', `/sales/${sale.id}/status`, { status: 'SHIPPED' });
    assert.equal(replay.shippedAt, shipped.shippedAt);
    assert.deepEqual((await snapshot()).inventory, before);
  });
});
