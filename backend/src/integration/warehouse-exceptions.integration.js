/** 仓储异常 HTTP 回归：只使用临时合成 SQLite 与真实角色鉴权，不接触业务数据库。 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('HTTP/SQLite：WAREHOUSE 异常出库、FIFO、分配边界与角色限制', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-warehouse-test-'));
  fs.chmodSync(directory, 0o700);
  const dbFile = path.join(directory, 'synthetic.db');
  process.env.DATABASE_URL = `file:${dbFile}`;
  process.env.UPLOAD_DIR = path.join(directory, 'uploads');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-only-warehouse-secret-never-for-production';
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
  for (const role of ['PURCHASE', 'WAREHOUSE']) {
    const user = await db.user.create({ data: { username: `synthetic-${role}`, password: 'test-only-unused-hash', name: `合成${role}`, role } });
    users[role] = { id: user.id, token: jwt.sign({ userId: user.id }, config.jwt.secret) };
  }
  const supplier = await db.supplier.create({ data: { name: '合成仓储供应商' } });
  const products = await Promise.all(['ATOMIC', 'SHORT', 'FIFO', 'SOURCE'].map(name => db.product.create({ data: { customsName: `SYNTHETIC ${name}`, unit: '件' } })));
  const app = require('../app');
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const call = async (method, url, body, { role = 'WAREHOUSE', expected = 200 } = {}) => {
    const response = await fetch(base + url, { method, headers: { authorization: `Bearer ${users[role].token}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const result = await response.json();
    assert.equal(response.status, expected, `${method} ${url}: ${result.message || result.error || ''}`);
    return result.data;
  };
  let sequence = 0;
  const sale = () => call('POST', '/sales', { exchangeRate: 7.2 }, { expected: 201 });
  const packing = (product, quantity, overrides = {}) => ({ productId: product.id, quantity, unit: '件', boxes: 1, grossWeight: 18000, netWeight: 17000, volume: 1, length: 1000, width: 1000, height: 1000, ...overrides });
  const prepare = async (lines) => {
    const contract = await sale();
    for (const line of lines) await call('POST', `/sales/${contract.id}/packing-items`, line, { expected: 201 });
    await call('PUT', `/sales/${contract.id}/status`, { status: 'CONFIRMED' });
    return contract;
  };
  const inventories = () => db.inventory.findMany({ orderBy: { id: 'asc' } });
  const receive = async (purchase, item, quantity) => call('POST', `/purchases/${purchase.id}/receipts`, { requestId: `synthetic-arrival-${++sequence}`, arrivedAt: '2026-10-01', items: [{ purchaseItemId: item.id, arrivedQuantity: quantity }] });
  const inspect = (purchase, receipt, acceptedQuantity, reinspectionQuantity = 0) => call('POST', `/purchases/${purchase.id}/receipts/${receipt.receipt.id}/inspection`, { requestId: `synthetic-inspection-${++sequence}`, note: '合成仓储验货依据', items: [{ receiptItemId: receipt.receipt.items[0].id, acceptedQuantity, reinspectionQuantity }] });
  const purchase = async (product, quantity, boxes = 10) => {
    const created = await call('POST', '/purchases', { supplierId: supplier.id, taxRate: 13, items: [{ productId: product.id, quantity, unit: '件', unitPrice: 10 }] }, { role: 'PURCHASE', expected: 201 });
    const contract = created.contract || created;
    await call('PUT', `/purchases/${contract.id}/status`, { status: 'SIGNED' }, { role: 'PURCHASE' });
    await call('PUT', `/purchases/${contract.id}/production-details`, { completeProduction: true, items: [{ id: contract.items[0].id, specification: '合成箱', boxes, grossWeight: 20000, netWeight: 19000, volume: 10, length: 1000, width: 1000, height: 1000 }] }, { role: 'PURCHASE' });
    await call('PUT', `/purchases/${contract.id}/status`, { status: 'SHIPPED' }, { role: 'PURCHASE' });
    return contract;
  };

  await t.test('负数与零数量的自有货物不得跳过库存校验登记发运', async () => {
    for (const quantity of [-1, 0]) {
      const contract = await prepare([packing(products[0], quantity)]);
      const before = await inventories();
      await call('PUT', `/sales/${contract.id}/status`, { status: 'SHIPPED' }, { expected: 400 });
      const persisted = await db.salesContract.findUnique({ where: { id: contract.id } });
      assert.equal(persisted.status, 'PACKING');
      assert.equal(persisted.shippedAt, null);
      assert.deepEqual(await inventories(), before);
    }
  });

  await t.test('空草稿、未完成零值装箱及非自有拼柜不受出库数量校验影响', async () => {
    const draft = await sale();
    assert.equal((await call('GET', `/sales/${draft.id}`)).status, 'DRAFT');
    const item = await call('POST', `/sales/${draft.id}/packing-items`, packing(products[0], 0), { expected: 201 });
    assert.equal((await db.salesContract.findUnique({ where: { id: draft.id } })).status, 'DRAFT');
    // 所有权来自真实持久化合成导入资料；不替换任何 API、服务或权限校验。
    await db.packingItem.update({ where: { id: item.id }, data: { isOwnedByJiesong: false, sourceParty: '合成第三方拼柜' } });
    await call('PUT', `/sales/${draft.id}/status`, { status: 'CONFIRMED' });
    const before = await inventories();
    await call('PUT', `/sales/${draft.id}/status`, { status: 'SHIPPED' });
    await call('PUT', `/sales/${draft.id}/packing-items/${item.id}`, { quantity: 0, unitPrice: 0, note: '合成单证补录' });
    assert.equal((await db.salesContract.findUnique({ where: { id: draft.id } })).status, 'SHIPPED');
    assert.deepEqual(await inventories(), before);
  });

  await t.test('待验与待复验均不计可用量；第二货品缺货回滚第一货品已扣减量', async () => {
    const a = await purchase(products[0], 10);
    const b = await purchase(products[1], 10);
    const first = await receive(a, a.items[0], 10);
    const second = await receive(b, b.items[0], 10);
    await inspect(a, first, 10);
    const held = await inspect(b, second, 0, 4);
    assert.equal(held.summary.totals.pendingQuantity, 6);
    assert.equal(held.summary.totals.reinspectionQuantity, 4);
    const snapshot = await call('GET', '/inventory/snapshot');
    assert.equal(snapshot.byProduct.find(row => row.productId === products[0].id).availableQuantity, 10);
    assert.equal(snapshot.byProduct.find(row => row.productId === products[1].id)?.availableQuantity || 0, 0);
    const contract = await prepare([packing(products[0], 4, { grossWeight: 10000 }), packing(products[1], 1, { grossWeight: 10000 })]);
    const before = await inventories();
    await call('PUT', `/sales/${contract.id}/status`, { status: 'SHIPPED' }, { expected: 400 });
    assert.deepEqual(await inventories(), before, '第一行的扣减/拆分也必须原子回滚');
    assert.equal((await db.salesContract.findUnique({ where: { id: contract.id } })).shippedAt, null);
    assert.equal(await db.inventory.count({ where: { quantity: { lt: 0 } } }), 0);
    await call('DELETE', `/sales/${contract.id}`);
  });

  await t.test('跨验货批次 FIFO 拆分保留来源；重复发运不改变库存与发运时间', async () => {
    const contract = await purchase(products[2], 10);
    const first = await receive(contract, contract.items[0], 4);
    await inspect(contract, first, 4);
    const older = await db.inventory.findFirst({ where: { purchaseItemId: contract.items[0].id } });
    const second = await receive(contract, contract.items[0], 6);
    await inspect(contract, second, 6);
    const newer = await db.inventory.findFirst({ where: { purchaseItemId: contract.items[0].id, id: { not: older.id } } });
    const history = await call('GET', `/purchases/${contract.id}/receipts/${first.receipt.id}/inspections`);
    assert.equal(history.items[0].inspectedBy.id, users.WAREHOUSE.id);
    const exportContract = await prepare([packing(products[2], 7)]);
    await call('PUT', `/sales/${exportContract.id}/status`, { status: 'SHIPPED' });
    const outbound = await db.inventory.findMany({ where: { salesContractId: exportContract.id }, orderBy: { quantity: 'desc' } });
    assert.equal(outbound.length, 2);
    assert.equal(outbound[0].id, older.id);
    assert.equal(outbound[0].quantity, 4);
    assert.equal(outbound[0].receiptInspectionId, older.receiptInspectionId);
    assert.equal(outbound[1].quantity, 3);
    assert.equal(outbound[1].receiptInspectionId, newer.receiptInspectionId);
    assert.equal(outbound[1].inboundAt.getTime(), newer.inboundAt.getTime());
    assert.equal((await db.inventory.findUnique({ where: { id: newer.id } })).quantity, 3);
    const before = await inventories();
    const shipped = await db.salesContract.findUnique({ where: { id: exportContract.id } });
    await call('PUT', `/sales/${exportContract.id}/status`, { status: 'SHIPPED' });
    assert.deepEqual(await inventories(), before);
    assert.equal((await db.salesContract.findUnique({ where: { id: exportContract.id } })).shippedAt.getTime(), shipped.shippedAt.getTime());
    const row = await db.packingItem.findFirst({ where: { salesContractId: exportContract.id } });
    await call('PUT', `/sales/${exportContract.id}/packing-items/${row.id}`, { unitPrice: 0, note: '合成价格及单证补录' });
    assert.deepEqual(await inventories(), before);
    assert.equal((await call('GET', `/inventory/contract/${exportContract.id}`)).reduce((sum, row) => sum + row.quantity, 0), 7);
    assert.equal((await call('GET', `/inventory/snapshot?productId=${products[2].id}`)).byProduct[0].availableQuantity, 3);
  });

  await t.test('仓储导入箱数不得超分配，整批失败无部分行；来源库存手工批转拒绝', async () => {
    const source = await purchase(products[3], 10);
    const a = await sale();
    const b = await sale();
    const pi = source.items[0];
    await call('POST', `/sales/${a.id}/import-purchase-items`, { items: [{ purchaseItemId: pi.id, boxes: 6 }] }, { expected: 201 });
    const available = await call('GET', `/sales/${b.id}/available-purchase-items`);
    assert.equal(available.find(row => row.id === pi.id).remaining.boxes, 4);
    await call('POST', `/sales/${b.id}/import-purchase-items`, { items: [{ purchaseItemId: pi.id, boxes: 5 }] }, { expected: 400 });
    await call('POST', `/sales/${b.id}/import-purchase-items`, { items: [{ purchaseItemId: pi.id, boxes: 2 }, { purchaseItemId: pi.id, boxes: 2 }] }, { expected: 400 });
    await call('POST', `/sales/${b.id}/import-purchase-items`, { items: [{ purchaseItemId: pi.id, boxes: 2 }, { purchaseItemId: 'synthetic-missing', boxes: 1 }] }, { expected: 400 });
    assert.equal(await db.packingItem.count({ where: { salesContractId: b.id } }), 0);
    assert.equal((await db.salesContract.findUnique({ where: { id: b.id } })).totalBoxes, 0);
    const receipt = await receive(source, pi, 10);
    await inspect(source, receipt, 6, 4);
    const stock = await db.inventory.findFirst({ where: { purchaseItemId: pi.id } });
    const batch = await call('PUT', '/inventory/batch-status', { ids: [stock.id, 'synthetic-missing'], status: 'OUTBOUND' });
    assert.equal(batch.success, 0);
    assert.equal(batch.failed, 2);
    assert.deepEqual(await db.inventory.findUnique({ where: { id: stock.id } }), stock);
    await call('DELETE', `/sales/${a.id}`);
    assert.equal((await call('GET', `/sales/${b.id}/available-purchase-items`)).find(row => row.id === pi.id).remaining.boxes, 10);
    const otherSource = await purchase(products[3], 10);
    const otherReceipt = await receive(otherSource, otherSource.items[0], 10);
    await inspect(otherSource, otherReceipt, 10);
    await call('POST', `/sales/${b.id}/import-purchase-items`, { items: [{ purchaseItemId: pi.id, boxes: 10 }] }, { expected: 201 });
    await call('PUT', `/sales/${b.id}/status`, { status: 'CONFIRMED' });
    const beforeShipment = await inventories();
    // 同商品的另一采购有库存，也不能冒充本装箱行尚待复验的采购来源。
    await call('PUT', `/sales/${b.id}/status`, { status: 'SHIPPED' }, { expected: 400 });
    assert.deepEqual(await inventories(), beforeShipment);
    await inspect(source, receipt, 10);
    await call('PUT', `/sales/${b.id}/status`, { status: 'SHIPPED' });
    assert.equal((await db.inventory.aggregate({ where: { purchaseItemId: otherSource.items[0].id, status: 'INBOUND' }, _sum: { quantity: true } }))._sum.quantity, 10);
    assert.equal((await call('GET', `/inventory/contract/${b.id}`)).reduce((sum, row) => sum + row.quantity, 0), 10);
  });

  await t.test('真实 WAREHOUSE 可查库存及到货史，财务证据/退税确认/改权入口拒绝', async () => {
    for (const url of ['/inventory?lite=true', '/inventory/stats', '/inventory/alerts', `/inventory/product/${products[0].id}`]) await call('GET', url);
    for (const [method, url, body] of [
      ['GET', '/users'],
      ['GET', '/finance/statements/evidence/documents'],
      ['GET', '/finance/receivable-reconciliation'],
      ['GET', '/tax-refunds/workbench/synthetic-sale/preparation'],
      ['POST', '/tax-refunds/workbench/synthetic-sale/confirm', {}],
      ['POST', '/tax-refunds/auto-drafts', {}],
      ['PUT', `/users/${users.WAREHOUSE.id}`, { role: 'ADMIN' }],
      ['PUT', '/system/configs/synthetic-setting', { value: 'blocked' }],
    ]) await call(method, url, body, { expected: 403 });
    assert.equal((await db.user.findUnique({ where: { id: users.WAREHOUSE.id } })).role, 'WAREHOUSE');
    assert.equal(await db.taxRefund.count(), 0);
    assert.equal(await db.inventory.count({ where: { quantity: { lte: 0 } } }), 0);
    assert.equal(await db.systemConfig.count({ where: { key: 'synthetic-setting' } }), 0);
  });
});
