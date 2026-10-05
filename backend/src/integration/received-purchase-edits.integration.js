/** 收货后采购更正 HTTP 回归：隔离合成 SQLite、真实路由与 PURCHASE/WAREHOUSE 身份。 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('HTTP/SQLite：分批收验货及分配出库后拒绝破坏性采购更正，保留合法资料补录', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-received-edits-'));
  fs.chmodSync(directory, 0o700);
  const dbFile = path.join(directory, 'synthetic.db');
  process.env.DATABASE_URL = `file:${dbFile}`;
  process.env.UPLOAD_DIR = path.join(directory, 'uploads');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-only-received-edits-never-for-production';
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
    const user = await db.user.create({ data: { username: `synthetic-received-edits-${role}`, password: 'test-only-unused-hash', name: `合成${role}`, role } });
    users[role] = { id: user.id, token: jwt.sign({ userId: user.id }, config.jwt.secret) };
  }
  const suppliers = await Promise.all([1, 2].map(index => db.supplier.create({ data: { name: `合成更正供应商${index}` } })));
  const products = await Promise.all([1, 2, 3].map(index => db.product.create({ data: { customsName: `SYNTHETIC RECEIVED EDIT ${index}`, unit: '件' } })));
  const app = require('../app');
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const call = async (method, url, body, expected = 200, role = 'PURCHASE') => {
    const response = await fetch(base + url, { method, headers: { authorization: `Bearer ${users[role].token}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const result = await response.json();
    assert.equal(response.status, expected, `${method} ${url}: ${result.message || result.error || ''}`);
    return result.data;
  };
  const result = await call('POST', '/purchases', { supplierId: suppliers[0].id, taxRate: 13, items: [10, 5].map((quantity, index) => ({ productId: products[index].id, quantity, unit: '件', unitPrice: 10 })) }, 201);
  const contract = result.contract || result;
  const url = `/purchases/${contract.id}`;
  const items = contract.items;
  const production = items.map(item => ({ id: item.id, specification: '合成原规格', boxes: item.quantity, grossWeight: item.quantity * 4500, netWeight: item.quantity * 4300, volume: item.quantity / 10 }));
  await call('PUT', `${url}/status`, { status: 'SIGNED' });
  await call('PUT', `${url}/production-details`, { completeProduction: true, items: production });
  await call('PUT', `${url}/status`, { status: 'SHIPPED' });
  // 合成既有付款义务仅作保护性断言；不替代支付流程或连接真实财务数据。
  await db.payment.create({ data: { type: 'PURCHASE', purchaseContractId: contract.id, amount: 10, currency: 'CNY', paymentDate: new Date('2026-10-01'), note: '合成已付定金' } });
  await db.purchaseContract.update({ where: { id: contract.id }, data: { paidAmount: 10 } });
  const snapshot = async () => ({
    contract: await db.purchaseContract.findUnique({ where: { id: contract.id } }),
    purchaseItems: await db.purchaseItem.findMany({ where: { purchaseContractId: contract.id }, orderBy: { id: 'asc' } }),
    receipts: await db.purchaseReceipt.findMany({ where: { purchaseContractId: contract.id }, orderBy: { id: 'asc' } }),
    receiptItems: await db.purchaseReceiptItem.findMany({ where: { receipt: { purchaseContractId: contract.id } }, orderBy: { id: 'asc' } }),
    inspections: await db.purchaseReceiptInspection.findMany({ where: { receipt: { purchaseContractId: contract.id } }, orderBy: { id: 'asc' } }),
    inventory: await db.inventory.findMany({ where: { purchaseItem: { purchaseContractId: contract.id } }, orderBy: { id: 'asc' } }),
    payments: await db.payment.findMany({ where: { purchaseContractId: contract.id }, orderBy: { id: 'asc' } }),
    packingItems: await db.packingItem.findMany({ where: { purchaseItem: { purchaseContractId: contract.id } }, orderBy: { id: 'asc' } }),
  });
  const protectedFacts = value => ({
    contract: Object.fromEntries(['id', 'contractNo', 'supplierId', 'totalAmount', 'paidAmount', 'taxRate', 'status', 'productionCompletedAt'].map(key => [key, value.contract[key]])),
    purchaseItems: value.purchaseItems.map(item => Object.fromEntries(['id', 'purchaseContractId', 'productId', 'quantity', 'unit', 'unitPrice', 'totalPrice'].map(key => [key, item[key]]))),
    receipts: value.receipts, receiptItems: value.receiptItems, inspections: value.inspections,
    inventory: value.inventory, payments: value.payments, packingItems: value.packingItems,
  });
  const arrival = async (requestId, quantities) => (await call('POST', `${url}/receipts`, { requestId, arrivedAt: '2026-10-01', note: '合成到货原始证据', items: quantities.map(([index, arrivedQuantity]) => ({ purchaseItemId: items[index].id, arrivedQuantity })) }, 200, 'WAREHOUSE')).receipt;
  const inspect = (receipt, requestId, quantities) => call('POST', `${url}/receipts/${receipt.id}/inspection`, { requestId, note: '合成验货原始证据', items: quantities.map(([index, acceptedQuantity, reinspectionQuantity = 0]) => ({ receiptItemId: receipt.items.find(row => row.purchaseItemId === items[index].id).id, acceptedQuantity, reinspectionQuantity })) }, 200, 'WAREHOUSE');
  const verify = async (label, role, incomplete) => t.test(label, async () => {
    const before = await snapshot();
    const edits = [
      ['下调到货行订量', 'PUT', url, { items: items.map((item, index) => ({ ...item, quantity: index === 0 ? 1 : item.quantity })) }],
      ['上调到货行订量', 'PUT', url, { items: items.map((item, index) => ({ ...item, quantity: index === 0 ? 20 : item.quantity })) }],
      ['更换到货行单位', 'PUT', url, { items: items.map((item, index) => ({ ...item, unit: index === 0 ? '箱' : item.unit })) }],
      ['更换到货行商品', 'PUT', url, { items: items.map((item, index) => ({ ...item, productId: index === 0 ? products[2].id : item.productId })) }],
      ['更换供应商', 'PUT', url, { supplierId: suppliers[1].id }],
      ['删除已到货采购行', 'PUT', url, { items: [items[1]] }],
      ['删除另一采购行', 'PUT', url, { items: [items[0]] }],
      ['追加采购行', 'POST', `${url}/items`, { productId: products[2].id, quantity: 1, unitPrice: 1 }],
      ['删除整个合同', 'DELETE', url, undefined],
    ];
    for (const [description, method, endpoint, input] of edits) {
      await call(method, endpoint, input, 400, role);
      assert.deepEqual(await snapshot(), before, `${description}不能改写来源、证据、库存、分配或付款义务`);
    }
    for (const status of ['CANCELLED', 'DRAFT', incomplete ? 'RECEIVED' : 'COMPLETED']) {
      await call('PUT', `${url}/status`, { status }, 400, role);
      assert.deepEqual(await snapshot(), before, `状态${status}不能抹去履行事实或未结清义务`);
    }
    // 发货后补录生产资料和发票号码是现有专用接口的合法行为，不应一并禁止。
    await call('PUT', `${url}/production-details`, { items: production.map(item => ({ ...item, specification: `合成补录-${label}` })) }, 200, role);
    const invoice = await call('PUT', `${url}/invoice-numbers`, { invoiceNumbers: ['SYNTHETIC-INVOICE-1', 'SYNTHETIC-INVOICE-2'] }, 200, role);
    assert.deepEqual(invoice.invoiceNumbers, ['SYNTHETIC-INVOICE-1', 'SYNTHETIC-INVOICE-2']);
    const after = await snapshot();
    assert.equal(after.purchaseItems[0].specification, `合成补录-${label}`);
    assert.deepEqual(protectedFacts(after), protectedFacts(before), '合法补录必须保持采购行身份、收验货证据、库存来源和应付款');
  });

  const first = await arrival('received-edit-first', [[0, 4]]);
  await verify('部分到货未验货', 'PURCHASE', true);
  assert.equal((await snapshot()).inventory.length, 0);
  await inspect(first, 'received-edit-initial-inspection', [[0, 2, 1]]);
  await verify('部分验货含待验与待复验', 'WAREHOUSE', true);
  await inspect(first, 'received-edit-reinspection', [[0, 3, 0]]);
  await verify('复验后仍未全量合格', 'PURCHASE', true);
  const second = await arrival('received-edit-remainder', [[0, 6], [1, 5]]);
  await inspect(first, 'received-edit-first-complete', [[0, 4, 0]]);
  await inspect(second, 'received-edit-second-complete', [[0, 6, 0], [1, 5, 0]]);
  await verify('全量验货合格库存未分配', 'WAREHOUSE', false);

  const sale = await call('POST', '/sales', { exchangeRate: 7.2 }, 201, 'WAREHOUSE');
  await call('POST', `/sales/${sale.id}/import-purchase-items`, { items: [{ purchaseItemId: items[0].id, boxes: 4 }] }, 201, 'WAREHOUSE');
  await verify('合格库存已关联销售装箱分配', 'PURCHASE', false);
  await call('PUT', `/sales/${sale.id}/status`, { status: 'CONFIRMED' }, 200, 'WAREHOUSE');
  await call('PUT', `/sales/${sale.id}/status`, { status: 'SHIPPED' }, 200, 'WAREHOUSE');
  await verify('来源库存已部分出库', 'WAREHOUSE', false);
  const outbound = await snapshot();
  assert.equal(outbound.inventory.filter(row => row.status === 'OUTBOUND').reduce((sum, row) => sum + row.quantity, 0), 4);
  assert.ok(outbound.inventory.every(row => row.receiptInspectionId));
  assert.equal(outbound.contract.status, 'RECEIVED', '存在未付尾款仍保留收货未结清状态');
  const summary = await call('GET', `${url}/receipts`, undefined, 200, 'WAREHOUSE');
  assert.equal(summary.summary.complete, true);
  assert.equal(summary.summary.items.find(row => row.purchaseItemId === items[0].id).acceptedQuantity, 10);
  assert.equal(summary.summary.items.find(row => row.purchaseItemId === items[1].id).acceptedQuantity, 5);
});
