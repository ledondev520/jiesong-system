/** 真实 HTTP/SQLite 销售发运货物保护回归；仅使用临时合成数据，不读取业务库。 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('HTTP/SQLite：发运后不能通过销售或旧货柜入口篡改已出库货物', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-sales-cargo-test-'));
  fs.chmodSync(directory, 0o700);
  const dbFile = path.join(directory, 'synthetic.db');
  process.env.DATABASE_URL = `file:${dbFile}`;
  process.env.UPLOAD_DIR = path.join(directory, 'uploads');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-only-lifecycle-secret-never-for-production';
  let db, server;
  t.after(async () => { if (server) await new Promise(resolve => server.close(resolve)); if (db) await db.$disconnect(); fs.rmSync(directory, { recursive: true, force: true }); });
  const ddl = execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', path.resolve(__dirname, '../../prisma/schema.prisma'), '--script'], { encoding: 'utf8', timeout: 30000 });
  execFileSync('python3', ['-c', 'import sqlite3,sys,os; os.umask(0o077); c=sqlite3.connect(sys.argv[1]); c.executescript(sys.stdin.read()); c.close()', dbFile], { input: ddl });
  fs.chmodSync(dbFile, 0o600);
  db = require('../utils/prisma');
  const jwt = require('jsonwebtoken');
  const config = require('../config');
  const users = {};
  for (const role of ['ADMIN', 'PURCHASE', 'WAREHOUSE', 'SALES', 'FINANCE', 'BOSS']) {
    const user = await db.user.create({ data: { username: `synthetic-${role}`, password: 'test-only-unused-hash', name: `合成${role}`, role } });
    users[role] = { id: user.id, token: jwt.sign({ userId: user.id }, config.jwt.secret) };
  }
  const supplier = await db.supplier.create({ data: { name: '合成供应商', taxId: 'SYNTHETIC-TAX-ID' } });
  const product = await db.product.create({ data: { customsName: 'SYNTHETIC WIDGET', unit: '件', hsCode: '9999999999', declaration: '合成测试要素' } });
  const port = await db.port.create({ data: { name: '合成港口', code: 'QA' } });
  await db.hsCode.create({ data: { hsCode: '9999999999', productName: '合成测试商品', taxRate: 0, vatRate: 13, refundRate: 13, effectiveDate: new Date('2026-01-01') } });
  const app = require('../app');
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const call = async (method, url, body, { role = 'ADMIN', expected = 200, headers = {} } = {}) => {
    const response = await fetch(base + url, { method, headers: { authorization: `Bearer ${users[role].token}`, ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...headers }, ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }) });
    const result = await response.json();
    assert.equal(response.status, expected, `${method} ${url}: ${result.message || result.error || ''}`);
    return result.data;
  };
  const purchaseResult = await call('POST', '/purchases', { supplierId: supplier.id, taxRate: 13, items: [{ productId: product.id, quantity: 100, unit: '件', unitPrice: 10 }] }, { role: 'PURCHASE', expected: 201 });
  const purchase = purchaseResult.contract || purchaseResult;
  const pi = purchase.items[0];
  await call('PUT', `/purchases/${purchase.id}/status`, { status: 'SIGNED' }, { role: 'PURCHASE' });
  await call('PUT', `/purchases/${purchase.id}/production-details`, { completeProduction: true, items: [{ id: pi.id, specification: '合成重型箱', boxes: 10, grossWeight: 40000, netWeight: 38000, volume: 10, length: 1000, width: 1000, height: 1000 }] }, { role: 'PURCHASE' });
  await call('PUT', `/purchases/${purchase.id}/status`, { status: 'SHIPPED' }, { role: 'PURCHASE' });
  const receipt = await call('POST', `/purchases/${purchase.id}/receipts`, { requestId: 'synthetic-cargo-arrival', arrivedAt: '2026-10-01', items: [{ purchaseItemId: pi.id, arrivedQuantity: 100 }] }, { role: 'WAREHOUSE' });
  await call('POST', `/purchases/${purchase.id}/receipts/${receipt.receipt.id}/inspection`, { requestId: 'synthetic-cargo-inspection', note: '合成验货依据', items: [{ receiptItemId: receipt.receipt.items[0].id, acceptedQuantity: 100, reinspectionQuantity: 0 }] }, { role: 'WAREHOUSE' });
  const sale = await call('POST', '/sales', { exchangeRate: 7.2 }, { role: 'SALES', expected: 201 });
  const imported = await call('POST', `/sales/${sale.id}/import-purchase-items`, { items: [{ purchaseItemId: pi.id, boxes: 5 }] }, { role: 'SALES', expected: 201 });
  const packing = imported.items[0];
  await call('PUT', `/sales/${sale.id}/status`, { status: 'CONFIRMED' }, { role: 'SALES' });
  await call('PUT', `/sales/${sale.id}/status`, { status: 'SHIPPED' }, { role: 'SALES' });
  const snapshot = async () => ({
    contract: await db.salesContract.findUnique({ where: { id: sale.id } }),
    packing: await db.packingItem.findMany({ where: { salesContractId: sale.id }, orderBy: { id: 'asc' } }),
    inventory: await db.inventory.findMany({ orderBy: { id: 'asc' } }),
  });
  const before = await snapshot();
  assert.equal(before.inventory.filter(row => row.status === 'OUTBOUND').reduce((sum, row) => sum + row.quantity, 0), 50);
  assert.equal(before.inventory.filter(row => row.status === 'INBOUND').reduce((sum, row) => sum + row.quantity, 0), 50);
  await call('POST', `/sales/${sale.id}/import-purchase-items`, { items: [{ purchaseItemId: pi.id, boxes: 5 }] }, { role: 'SALES', expected: 400 });
  assert.deepEqual(await snapshot(), before, '被拒绝的发运后导入不能修改装箱行、合同或库存');
  const manualCargo = { productId: product.id, quantity: 50, unit: '件', boxes: 5, grossWeight: 20000, netWeight: 19000, volume: 5, length: 1000, width: 1000, height: 1000 };
  for (const root of ['sales', 'containers']) {
    const itemsPath = root === 'sales' ? 'packing-items' : 'items';
    await call('POST', `/${root}/${sale.id}/${itemsPath}`, manualCargo, { role: 'SALES', expected: 400 });
    await call('PUT', `/${root}/${sale.id}/${itemsPath}/${packing.id}`, { unit: '箱' }, { role: 'SALES', expected: 400 });
    await call('PUT', `/${root}/${sale.id}/${itemsPath}/${packing.id}`, { quantity: 1 }, { role: 'SALES', expected: 400 });
    await call('PUT', `/${root}/${sale.id}/${itemsPath}/${packing.id}`, { boxes: 1 }, { role: 'SALES', expected: 400 });
    await call('DELETE', `/${root}/${sale.id}/${itemsPath}/${packing.id}`, undefined, { role: 'SALES', expected: 400 });
    await call('DELETE', `/${root}/${sale.id}`, undefined, { role: 'SALES', expected: 400 });
    assert.deepEqual(await snapshot(), before, `${root} 拒绝货物变更后必须保持出库与装箱一致`);
  }
  const draft = await call('POST', '/sales', { exchangeRate: 7.2 }, { role: 'SALES', expected: 201 });
  for (const root of ['sales', 'containers']) {
    const itemsPath = root === 'sales' ? 'packing-items' : 'items';
    await call('PUT', `/${root}/${draft.id}/${itemsPath}/${packing.id}`, { quantity: 1 }, { role: 'SALES', expected: 404 });
    await call('DELETE', `/${root}/${draft.id}/${itemsPath}/${packing.id}`, undefined, { role: 'SALES', expected: 404 });
    const temporary = await call('POST', `/${root}/${draft.id}/${itemsPath}`, { ...manualCargo, quantity: 1, boxes: 1 }, { role: 'SALES', expected: 201 });
    await call('DELETE', `/${root}/${draft.id}/${itemsPath}/${temporary.id}`, undefined, { role: 'SALES' });
  }
  assert.deepEqual(await snapshot(), before, '不能借用未发运合同号修改其他货柜的装箱行');
  // 历史资料和单证价格可补录；相同数量/单位重复保存不应误报。
  await call('PUT', `/sales/${sale.id}/packing-items/${packing.id}`, { quantity: 50, unit: '件', unitPrice: 12, invoiceNo: 'SYNTHETIC-INVOICE', note: '合成单证补录' }, { role: 'SALES' });
  await call('PUT', `/containers/${sale.id}/items/${packing.id}`, { quantity: '50', unit: '件', unitPrice: '12', note: '合成价格补录' }, { role: 'SALES' });
  assert.deepEqual((await snapshot()).inventory, before.inventory);
  await call('PUT', `/sales/${sale.id}/status`, { status: 'SHIPPED' }, { role: 'SALES' });
  assert.equal((await snapshot()).contract.shippedAt.getTime(), before.contract.shippedAt.getTime());
  assert.deepEqual((await snapshot()).inventory, before.inventory, '重复确认发运不能重复扣库');

  // 手工装箱行没有采购字段锁，仍需同样保护已出库数量。
  const manual = await call('POST', '/sales', { exchangeRate: 7.2 }, { role: 'SALES', expected: 201 });
  const manualPacking = await call('POST', `/containers/${manual.id}/items`, manualCargo, { role: 'SALES', expected: 201 });
  await call('PUT', `/containers/${manual.id}/items/${manualPacking.id}`, { note: '发运前可编辑', quantity: '50' }, { role: 'SALES' });
  await call('PUT', `/sales/${manual.id}/status`, { status: 'CONFIRMED' }, { role: 'SALES' });
  await call('PUT', `/sales/${manual.id}/status`, { status: 'SHIPPED' }, { role: 'SALES' });
  for (const root of ['sales', 'containers']) {
    const itemsPath = root === 'sales' ? 'packing-items' : 'items';
    await call('PUT', `/${root}/${manual.id}/${itemsPath}/${manualPacking.id}`, { quantity: 100 }, { role: 'SALES', expected: 400 });
  }
  // 防御旧入口已经留下的状态错误；出库证据仍然有效。
  await db.salesContract.update({ where: { id: manual.id }, data: { status: 'DRAFT' } });
  await call('POST', `/sales/${manual.id}/packing-items`, manualCargo, { role: 'SALES', expected: 400 });
  await call('DELETE', `/containers/${manual.id}/items/${manualPacking.id}`, undefined, { role: 'SALES', expected: 400 });
  await db.salesContract.update({ where: { id: manual.id }, data: { status: 'SHIPPED' } });

  await call('PUT', `/sales/${sale.id}/status`, { status: 'ARRIVED' }, { role: 'SALES' });
  await call('POST', `/sales/${sale.id}/packing-items`, manualCargo, { role: 'SALES', expected: 400 });
  await call('POST', '/finance/payments', { type: 'RECEIVABLE_COLLECTION', salesContractId: sale.id, currency: 'USD', amount: 600, paymentDate: '2026-10-01' }, { role: 'FINANCE', expected: 201 });
  assert.equal((await db.salesContract.findUnique({ where: { id: sale.id } })).status, 'COMPLETED');
  await call('POST', `/containers/${sale.id}/items`, manualCargo, { role: 'SALES', expected: 400 });
  const inventory = await db.inventory.findMany();
  assert.equal(inventory.filter(row => row.status === 'OUTBOUND').reduce((sum, row) => sum + row.quantity, 0), 100);
  assert.equal(inventory.filter(row => row.status === 'INBOUND').reduce((sum, row) => sum + row.quantity, 0), 0);
  assert.equal(await db.packingItem.count({ where: { salesContractId: sale.id } }), 1);
  assert.equal(await db.packingItem.count({ where: { salesContractId: manual.id } }), 1);
  const listed = await call('GET', '/sales?shipped=true', undefined, { role: 'SALES' });
  assert.equal(listed.items.find(row => row.id === sale.id).status, 'COMPLETED');
  assert.equal((await call('GET', `/sales/${sale.id}`, undefined, { role: 'SALES' })).packingItems[0].quantity, 50);
});
