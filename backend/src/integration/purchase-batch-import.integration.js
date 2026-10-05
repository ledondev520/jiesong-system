/** JSON 采购导入与创建边界 HTTP/迁移 SQLite 回归；只使用临时合成数据及测试 SQL 故障。 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('HTTP/SQLite：JSON 采购导入并发、逐行原子性、显式编号与权限', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-purchase-import-test-'));
  fs.chmodSync(directory, 0o700);
  const dbFile = path.join(directory, 'synthetic.db');
  process.env.DATABASE_URL = `file:${dbFile}`;
  process.env.UPLOAD_DIR = path.join(directory, 'uploads');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-only-import-secret-never-for-production';
  process.env.TZ = 'UTC';
  let db, server;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (db) await db.$disconnect();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  fs.writeFileSync(dbFile, '', { mode: 0o600 });
  execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy', '--schema', path.resolve(__dirname, '../../prisma/schema.prisma')], { stdio: 'pipe', timeout: 30000 });
  fs.chmodSync(dbFile, 0o600);
  assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
  assert.equal(fs.statSync(dbFile).mode & 0o777, 0o600);
  db = require('../utils/prisma');
  const jwt = require('jsonwebtoken');
  const config = require('../config');
  const users = {};
  for (const role of ['ADMIN', 'PURCHASE', 'WAREHOUSE', 'SALES', 'FINANCE', 'BOSS']) {
    const user = await db.user.create({ data: { username: `synthetic-import-${role}`, password: 'test-only-unused-hash', name: `合成${role}`, role } });
    users[role] = jwt.sign({ userId: user.id }, config.jwt.secret);
  }
  const supplier = await db.supplier.create({ data: { name: '合成导入供应商', taxId: 'SYNTHETIC-IMPORT-TAX-ID' } });
  const product = await db.product.create({ data: { customsName: 'SYNTHETIC IMPORT WIDGET', unit: '件', hsCode: '9999999999', declaration: '合成测试要素' } });
  const app = require('../app');
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const url = `http://127.0.0.1:${server.address().port}/api/v1/batch-import/purchase`;
  const row = { supplierName: supplier.name, productName: product.customsName, quantity: '6', price: '80', unit: '件', deliveryDate: '2026-10-01' };
  const importRows = async (data, { role = 'PURCHASE', expected = 200 } = {}) => {
    const response = await fetch(url, { method: 'POST', headers: { ...(role ? { authorization: `Bearer ${users[role]}` } : {}), 'Content-Type': 'application/json' }, body: JSON.stringify({ data }) });
    const body = await response.json();
    assert.equal(response.status, expected, body.message || 'Unexpected HTTP status');
    return body.data;
  };
  const snapshot = async () => ({
    contracts: await db.purchaseContract.findMany({ orderBy: { id: 'asc' } }),
    items: await db.purchaseItem.findMany({ orderBy: { id: 'asc' } }),
    inventory: await db.inventory.findMany({ orderBy: { id: 'asc' } }),
    receipts: await db.purchaseReceipt.findMany({ orderBy: { id: 'asc' } }),
    inspections: await db.purchaseReceiptInspection.findMany({ orderBy: { id: 'asc' } }),
    suppliers: await db.supplier.findMany({ orderBy: { id: 'asc' } }),
    products: await db.product.findMany({ orderBy: { id: 'asc' } }),
  });

  await t.test('同时空编号请求均成功，每个合同恰有一条明细', async () => {
    const before = await db.purchaseContract.count();
    const results = await Promise.all(Array.from({ length: 4 }, () => importRows([row])));
    for (const result of results) assert.deepEqual(result, { success: 1, failed: 0, errors: [] });
    assert.equal(await db.purchaseContract.count(), before + 4);
    const contracts = await db.purchaseContract.findMany({ include: { items: true } });
    assert.equal(new Set(contracts.map(contract => contract.contractNo)).size, contracts.length);
    for (const contract of contracts) {
      assert.equal(contract.status, 'DRAFT');
      assert.equal(contract.items.length, 1);
      assert.equal(contract.totalAmount, 480);
      assert.equal(contract.items[0].totalPrice, 480);
    }
  });

  await t.test('实际明细 SQL 失败回滚合同，仅该行失败，后续行继续', async () => {
    const before = await db.purchaseContract.count();
    const beforeItems = await db.purchaseItem.count();
    await db.$executeRawUnsafe(`CREATE TRIGGER synthetic_import_item_failure BEFORE INSERT ON purchase_items WHEN NEW.quantity = 777 BEGIN SELECT RAISE(ABORT, 'synthetic item failure'); END`);
    let result;
    try {
      result = await importRows([
        { ...row, _rowNum: 8, contractNo: 'SYNTHETIC-BEFORE-FAILURE' },
        { ...row, _rowNum: 9, contractNo: 'SYNTHETIC-MUST-ROLL-BACK', quantity: '777' },
        { ...row, _rowNum: 10, quantity: '777' },
        { ...row, _rowNum: 11, contractNo: 'SYNTHETIC-AFTER-FAILURE' },
      ]);
    } finally {
      await db.$executeRawUnsafe('DROP TRIGGER synthetic_import_item_failure');
    }
    assert.equal(result.success, 2);
    assert.equal(result.failed, 2);
    assert.deepEqual(result.errors.map(error => error.row), [9, 10]);
    assert.equal(await db.purchaseContract.count(), before + 2, '失败行不能留下合同头');
    assert.equal(await db.purchaseItem.count(), beforeItems + 2);
    assert.equal(await db.purchaseContract.findUnique({ where: { contractNo: 'SYNTHETIC-MUST-ROLL-BACK' } }), null);
    assert.equal(await db.purchaseContract.count({ where: { items: { none: {} } } }), 0);
    assert.equal(await db.inventory.count(), 0);
    assert.equal(await db.purchaseReceipt.count(), 0);
    assert.equal(await db.payment.count(), 0);
    assert.equal(await db.supplier.count(), 1);
    assert.equal(await db.product.count(), 1);
  });

  await t.test('自定义编号不改号，重复行失败，不阻止合法后续行', async () => {
    const prefix = `CG${new Date().getFullYear().toString().slice(-2)}`;
    const before = await db.purchaseContract.count();
    const result = await importRows([
      { ...row, _rowNum: 20, contractNo: `${prefix}100000` },
      { ...row, _rowNum: 21, contractNo: `${prefix}CUSTOM` },
      { ...row, _rowNum: 22, contractNo: `${prefix}CUSTOM` },
      { ...row, _rowNum: 23, supplierName: 'SYNTHETIC MISSING SUPPLIER' },
      { ...row, _rowNum: 24, productName: 'SYNTHETIC MISSING PRODUCT' },
      { ...row, _rowNum: 25, quantity: 'invalid' },
      { ...row, _rowNum: 26 },
    ], { role: 'ADMIN' });
    assert.equal(result.success, 3);
    assert.equal(result.failed, 4);
    assert.deepEqual(result.errors.map(error => error.row), [22, 23, 24, 25]);
    assert.equal(await db.purchaseContract.count(), before + 3);
    for (const suffix of ['100000', 'CUSTOM', '100001']) {
      assert.ok(await db.purchaseContract.findUnique({ where: { contractNo: prefix + suffix } }));
    }
  });

  await t.test('采购与管理员之外的角色和未登录请求不能写入', async () => {
    const before = await db.purchaseContract.count();
    for (const role of ['WAREHOUSE', 'SALES', 'FINANCE', 'BOSS']) {
      await importRows([row], { role, expected: 403 });
    }
    await importRows([row], { role: null, expected: 401 });
    await importRows([], { expected: 400 });
    assert.equal(await db.purchaseContract.count(), before);
  });

  await t.test('空值、数组和基本类型逐行失败，前后合法行提交且跨请求重试不重复', async () => {
    const before = await snapshot();
    const valid = [
      { ...row, _rowNum: 31, contractNo: 'SYNTHETIC-SHAPE-BEFORE' },
      { ...row, _rowNum: 36, contractNo: 'SYNTHETIC-SHAPE-AFTER' },
    ];
    const result = await importRows([valid[0], null, [], 7, 'synthetic invalid row', valid[1]]);
    assert.equal(result.success, 2);
    assert.equal(result.failed, 4);
    assert.deepEqual(result.errors.map(error => error.row), [2, 3, 4, 5]);
    const after = await snapshot();
    assert.equal(after.contracts.length, before.contracts.length + 2);
    assert.equal(after.items.length, before.items.length + 2);
    for (const field of ['inventory', 'receipts', 'inspections', 'suppliers', 'products']) {
      assert.deepEqual(after[field], before[field]);
    }
    for (const input of valid) {
      const contract = await db.purchaseContract.findUnique({ where: { contractNo: input.contractNo }, include: { items: true } });
      assert.equal(contract.items.length, 1);
      assert.equal(contract.supplierId, supplier.id);
      assert.equal(contract.items[0].productId, product.id);
    }
    const replay = await importRows(valid);
    assert.equal(replay.success, 0);
    assert.equal(replay.failed, 2);
    assert.deepEqual(await snapshot(), after, '显式编号的已成功行重试不能新增合同、明细或来源库存');
  });

  await t.test('省略、空白或非法名称必须失败，不得退化成首条目录匹配', async () => {
    const invalid = [];
    for (const field of ['supplierName', 'productName']) {
      const omitted = { ...row, contractNo: `SYNTHETIC-OMITTED-${field}` };
      delete omitted[field];
      invalid.push(omitted);
      for (const value of [null, '', '   ', 7, [], {}, false]) {
        invalid.push({ ...row, [field]: value });
      }
    }
    const before = await snapshot();
    const result = await importRows(invalid);
    assert.equal(result.success, 0);
    assert.equal(result.failed, invalid.length);
    assert.deepEqual(result.errors.map(error => error.row), invalid.map((_, index) => index + 1));
    assert.deepEqual(await snapshot(), before);
  });

  await t.test('数量与价格沿用采购创建的有效范围，保留小数字符串和零单价', async () => {
    const before = await snapshot();
    const invalid = [
      { ...row, quantity: 0 },
      { ...row, quantity: '-2' },
      { ...row, quantity: 'Infinity' },
      { ...row, price: '-3' },
      { ...row, price: 'Infinity' },
    ];
    for (const field of ['quantity', 'price']) {
      const omitted = { ...row };
      delete omitted[field];
      invalid.push(omitted);
      for (const value of [null, '', '   ', false, true, [], [1], {}, '6 invalid']) {
        invalid.push({ ...row, [field]: value });
      }
    }
    const result = await importRows(invalid);
    assert.equal(result.success, 0);
    assert.equal(result.failed, invalid.length);
    assert.deepEqual(result.errors.map(error => error.row), invalid.map((_, index) => index + 1));
    assert.deepEqual(await snapshot(), before);
    const compatible = await importRows([
      { ...row, contractNo: 'SYNTHETIC-ZERO-PRICE', quantity: '6.5', price: '0' },
      { ...row, contractNo: 'SYNTHETIC-DECIMAL-PRICE', quantity: '2.5', price: '1.2' },
    ]);
    assert.deepEqual(compatible, { success: 2, failed: 0, errors: [] });
    for (const [contractNo, quantity, unitPrice, totalPrice] of [
      ['SYNTHETIC-ZERO-PRICE', 6.5, 0, 0],
      ['SYNTHETIC-DECIMAL-PRICE', 2.5, 1.2, 3],
    ]) {
      const contract = await db.purchaseContract.findUnique({ where: { contractNo }, include: { items: true } });
      assert.equal(contract.totalAmount, totalPrice);
      assert.equal(contract.items.length, 1);
      assert.equal(contract.items[0].quantity, quantity);
      assert.equal(contract.items[0].unitPrice, unitPrice);
      assert.equal(contract.items[0].totalPrice, totalPrice);
    }
    const after = await snapshot();
    for (const field of ['inventory', 'receipts', 'inspections', 'suppliers', 'products']) {
      assert.deepEqual(after[field], before[field]);
    }
  });

  await t.test('编号预览不保存，创建第二行关联失败全部回滚，修正后可复用编号', async () => {
    const before = await snapshot();
    const call = async (method, route, input) => {
      const response = await fetch(url.replace('/batch-import/purchase', route), {
        method,
        headers: { authorization: `Bearer ${users.PURCHASE}`, 'Content-Type': 'application/json' },
        ...(input === undefined ? {} : { body: JSON.stringify(input) }),
      });
      return { status: response.status, body: await response.json() };
    };
    const preview = await call('GET', '/purchases/options/next-no');
    assert.equal(preview.status, 200);
    assert.deepEqual(await snapshot(), before, '取消编号预览不会占号或保存任何业务数据');
    const input = {
      supplierId: supplier.id,
      contractNo: preview.body.data.contractNo,
      items: [
        { productId: product.id, quantity: 2, unit: '件', unitPrice: 10 },
        { productId: 'synthetic-missing-product', quantity: 3, unit: '件', unitPrice: 10 },
      ],
    };
    const failed = await call('POST', '/purchases', input);
    assert.ok(failed.status >= 400, '既有关联错误必须拒绝保存；本回归不改变原有HTTP状态码');
    assert.deepEqual(await snapshot(), before, '第二行失败不能留下表头或第一行');
    input.items[1].productId = product.id;
    const retry = await call('POST', '/purchases', input);
    assert.equal(retry.status, 201);
    const contract = retry.body.data.contract || retry.body.data;
    assert.equal(contract.contractNo, preview.body.data.contractNo);
    assert.equal(contract.items.length, 2);
    assert.equal(contract.totalAmount, 56.5);
    const persisted = await db.purchaseContract.findUnique({ where: { id: contract.id }, include: { items: true } });
    assert.equal(persisted.items.length, 2);
    const after = await snapshot();
    assert.equal(after.contracts.length, before.contracts.length + 1);
    assert.equal(after.items.length, before.items.length + 2);
    for (const field of ['inventory', 'receipts', 'inspections', 'suppliers', 'products']) {
      assert.deepEqual(after[field], before[field]);
    }
    // 等待真实 response-finish 审计写入后再清理私有数据库，不更改生产审计行为。
    const deadline = Date.now() + 3000;
    while (!await db.operationLog.findFirst({ where: { entity: 'PurchaseContract', entityId: contract.id, action: 'CREATE' } })) {
      assert.ok(Date.now() < deadline, '合成创建成功的审计必须在隔离库清理前落库');
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  });
});
