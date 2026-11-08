/** A83 库存批次号/库位 HTTP 回归：只使用临时合成 SQLite 与真实角色鉴权，不接触业务数据库。 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { copyTemplate } = require('../testHelpers/sqlite-template');

test('A83 迁移仅增列/增索引：两个可空 TEXT 列与两个索引，不改既有数据', () => {
  const sql = fs.readFileSync(path.resolve(__dirname, '../../prisma/migrations/20261109020000_add_inventory_lot_bin/migration.sql'), 'utf8');
  const statements = sql.split('\n').filter((line) => line.trim() && !line.startsWith('--'));
  assert.deepEqual(statements, [
    'ALTER TABLE "inventories" ADD COLUMN "lotNo" TEXT;',
    'ALTER TABLE "inventories" ADD COLUMN "binLocation" TEXT;',
    'CREATE INDEX "inventories_lotNo_idx" ON "inventories"("lotNo");',
    'CREATE INDEX "inventories_binLocation_idx" ON "inventories"("binLocation");',
  ]);
});

test('HTTP/SQLite：A83 验货入库登记批次与库位、FIFO 拆分保留、列表筛选、位置编辑与角色', async t => {
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
  copyTemplate('schema', dbFile);
  fs.chmodSync(dbFile, 0o600);
  db = require('../utils/prisma');
  // Order creation needs exactly one active customer (DATA-MODEL §2.4).
  await db.customer.create({ data: { name: '合成客户' } });
  const jwt = require('jsonwebtoken');
  const config = require('../config');
  const users = {};
  for (const role of ['PURCHASE', 'WAREHOUSE', 'SALES']) {
    const user = await db.user.create({ data: { username: `synthetic-${role}`, password: 'test-only-unused-hash', name: `合成${role}`, role } });
    users[role] = { id: user.id, token: jwt.sign({ userId: user.id }, config.jwt.secret) };
  }
  const supplier = await db.supplier.create({ data: { name: '合成仓储供应商' } });
  const products = await Promise.all(['LOTA', 'LOTB'].map(name => db.product.create({ data: { customsName: `SYNTHETIC ${name}`, unit: '件' } })));
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
  const inspect = (purchase, receipt, acceptedQuantity, reinspectionQuantity = 0, extra = {}) => call('POST', `/purchases/${purchase.id}/receipts/${receipt.receipt.id}/inspection`, { requestId: `synthetic-inspection-${++sequence}`, note: '合成仓储验货依据', items: [{ receiptItemId: receipt.receipt.items[0].id, acceptedQuantity, reinspectionQuantity, ...extra }] });
  const purchase = async (product, quantity, boxes = 10) => {
    const created = await call('POST', '/purchases', { supplierId: supplier.id, taxRate: 13, items: [{ productId: product.id, quantity, unit: '件', unitPrice: 10 }] }, { role: 'PURCHASE', expected: 201 });
    const contract = created.contract || created;
    await call('PUT', `/purchases/${contract.id}/status`, { status: 'SIGNED' }, { role: 'PURCHASE' });
    await call('PUT', `/purchases/${contract.id}/production-details`, { completeProduction: true, items: [{ id: contract.items[0].id, specification: '合成箱', boxes, grossWeight: 20000, netWeight: 19000, volume: 10, length: 1000, width: 1000, height: 1000 }] }, { role: 'PURCHASE' });
    await call('PUT', `/purchases/${contract.id}/status`, { status: 'SHIPPED' }, { role: 'PURCHASE' });
    return contract;
  };


  await t.test('入库登记批次/库位、拆分保留、筛选、编辑、校验与角色', async () => {
    const contract = await purchase(products[0], 10);
    const first = await receive(contract, contract.items[0], 10);
    await inspect(contract, first, 10, 0, { lotNo: '  LOT-2026-11  ', binLocation: 'A-01-02' });
    const stock = await db.inventory.findFirst({ where: { purchaseItemId: contract.items[0].id } });
    assert.equal(stock.lotNo, 'LOT-2026-11');
    assert.equal(stock.binLocation, 'A-01-02');

    // 未登记的入库行保持为空（不强制）。
    const other = await purchase(products[1], 5);
    await inspect(other, await receive(other, other.items[0], 5), 5);
    const plain = await db.inventory.findFirst({ where: { purchaseItemId: other.items[0].id } });
    assert.equal(plain.lotNo, null);
    assert.equal(plain.binLocation, null);

    // 校验：过长 / 非文本 / 控制字符整笔拒绝，不留库存。
    for (const extra of [{ lotNo: 'X'.repeat(51) }, { binLocation: 123 }, { lotNo: 'A\nB' }]) {
      const arrival = await purchase(products[1], 1);
      const arrived = await receive(arrival, arrival.items[0], 1);
      await call('POST', `/purchases/${arrival.id}/receipts/${arrived.receipt.id}/inspection`, { requestId: `synthetic-bad-${++sequence}`, items: [{ receiptItemId: arrived.receipt.items[0].id, acceptedQuantity: 1, reinspectionQuantity: 0, ...extra }] }, { expected: 400 });
      assert.equal(await db.inventory.count({ where: { purchaseItemId: arrival.items[0].id } }), 0);
    }

    // FIFO 拆分：部分出库后，出库行与剩余行都保留批次/库位。
    const exportContract = await prepare([packing(products[0], 4)]);
    await call('PUT', `/sales/${exportContract.id}/status`, { status: 'SHIPPED' });
    const rows = await db.inventory.findMany({ where: { purchaseItemId: contract.items[0].id } });
    assert.equal(rows.length, 2);
    for (const row of rows) {
      assert.equal(row.lotNo, 'LOT-2026-11');
      assert.equal(row.binLocation, 'A-01-02');
    }

    // 列表筛选（包含匹配），WAREHOUSE 与 SALES 均可读到批次/库位。
    for (const role of ['WAREHOUSE', 'SALES']) {
      const byLot = await call('GET', '/inventory?lotNo=2026-11&pageSize=100', undefined, { role });
      assert.equal(byLot.items.length, 2, `${role} lotNo`);
      assert.ok(byLot.items.every((row) => row.lotNo === 'LOT-2026-11' && row.binLocation === 'A-01-02'));
      assert.equal((await call('GET', '/inventory?binLocation=A-01&pageSize=100', undefined, { role })).items.length, 2);
      assert.equal((await call('GET', '/inventory?binLocation=Z-99&pageSize=100', undefined, { role })).items.length, 0);
      assert.equal((await call('GET', `/inventory/${stock.id}`, undefined, { role })).lotNo, 'LOT-2026-11');
    }
    const both = await call('GET', '/inventory?lotNo=LOT-2026-11&binLocation=Z-99', undefined, {});
    assert.equal(both.items.length, 0);

    // 位置编辑：WAREHOUSE 可改；省略保持；空串清空；SALES 403；空请求 400；不存在 404。
    assert.equal((await call('POST', `/inventory/${stock.id}/location`, { binLocation: 'B-02-03' })).binLocation, 'B-02-03');
    assert.equal((await db.inventory.findUnique({ where: { id: stock.id } })).lotNo, 'LOT-2026-11');
    assert.equal((await call('POST', `/inventory/${stock.id}/location`, { lotNo: '' })).lotNo, null);
    await call('POST', `/inventory/${stock.id}/location`, { lotNo: 'NO' }, { role: 'SALES', expected: 403 });
    await call('POST', `/inventory/${stock.id}/location`, {}, { expected: 400 });
    await call('POST', `/inventory/${stock.id}/location`, { lotNo: 'X'.repeat(51) }, { expected: 400 });
    await call('POST', '/inventory/missing-id/location', { lotNo: 'L' }, { expected: 404 });
    assert.equal((await db.inventory.findUnique({ where: { id: stock.id } })).binLocation, 'B-02-03');
  });
});
