/** JSON 采购批量导入 HTTP/SQLite 回归；只使用临时合成数据及测试 SQL 故障。 */
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
});
