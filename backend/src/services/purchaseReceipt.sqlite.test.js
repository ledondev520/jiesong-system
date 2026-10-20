// 只创建空结构与合成数据，不读取、复制或修改业务数据库；凭据仅供本进程测试。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('真实SQLite：分批验货幂等、并发限量、故障回滚与老板权限', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-receipt-test-'));
  fs.chmodSync(directory, 0o700);
  const databaseFile = path.join(directory, 'synthetic.db');
  process.env.DATABASE_URL = `file:${databaseFile}`;
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-only-receipt-jwt-secret-not-for-production';
  let server;
  let db;
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (db) await db.$disconnect();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  // 使用已安装Prisma生成空DDL；不是db push，也不会连接现有数据库。
  const ddl = execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', path.resolve(__dirname, '../../prisma/schema.prisma'), '--script'], { encoding: 'utf8', timeout: 30000 });
  execFileSync('python3', ['-c', 'import sqlite3,sys,os; os.umask(0o077); c=sqlite3.connect(sys.argv[1]); c.executescript(sys.stdin.read()); c.close()', databaseFile], { input: ddl });
  fs.chmodSync(databaseFile, 0o600);
  db = require('../utils/prisma');
  const service = require('./purchaseReceiptService');
  const jwt = require('jsonwebtoken');
  const config = require('../config');
  const { authenticate, clearAuthCache } = require('../middleware/auth');
  const admin = await db.user.create({ data: { username: 'synthetic-admin', name: '合成管理员', role: 'ADMIN', password: 'test-only-unused-password-hash' } });
  const boss = await db.user.create({ data: { username: 'synthetic-boss', name: '合成老板', role: 'BOSS', password: 'test-only-unused-password-hash' } });
  const supplier = await db.supplier.create({ data: { name: '合成供应商' } });
  const product = await db.product.create({ data: { customsName: '合成商品', unit: '件' } });
  const createContract = async (contractNo) => db.purchaseContract.create({ data: { contractNo, supplierId: supplier.id, status: 'SHIPPED', totalAmount: 100, items: { create: { productId: product.id, quantity: 10, unit: '件', unitPrice: 10, totalPrice: 100 } } }, include: { items: true } });
  const contract = await createContract('SYNTHETIC-RECEIPT');
  const arrival = (requestId, arrivedQuantity, purchaseItemId = contract.items[0].id) => ({ requestId, arrivedAt: '2026-10-01T00:00:00.000Z', items: [{ purchaseItemId, arrivedQuantity }] });
  const inspect = (requestId, receiptItemId, acceptedQuantity, reinspectionQuantity = 0) => ({ requestId, note: '合成验货依据', items: [{ receiptItemId, acceptedQuantity, reinspectionQuantity }] });
  const first = await service.createPurchaseReceipt(contract.id, arrival('arrival-1', 4), admin.id, db);
  assert.equal(first.summary.totals.pendingQuantity, 4);
  assert.equal(await db.inventory.count(), 0);
  assert.equal((await service.createPurchaseReceipt(contract.id, arrival('arrival-1', 4), admin.id, db)).idempotentReplay, true);
  await assert.rejects(service.createPurchaseReceipt(contract.id, arrival('arrival-1', 3), admin.id, db), (e) => e.statusCode === 409);
  const firstInspection = inspect('inspect-1', first.receipt.items[0].id, 2, 1);
  const partial = await service.inspectPurchaseReceipt(contract.id, first.receipt.id, firstInspection, admin.id, db);
  assert.equal(partial.status, 'SHIPPED');
  assert.equal(partial.summary.totals.pendingQuantity, 1);
  assert.equal(partial.summary.totals.reinspectionQuantity, 1);
  assert.equal((await db.inventory.aggregate({ _sum: { quantity: true } }))._sum.quantity, 2);
  assert.equal((await service.inspectPurchaseReceipt(contract.id, first.receipt.id, firstInspection, admin.id, db)).idempotentReplay, true);
  await service.inspectPurchaseReceipt(contract.id, first.receipt.id, inspect('inspect-2', first.receipt.items[0].id, 4), admin.id, db);
  assert.equal((await db.inventory.aggregate({ _sum: { quantity: true } }))._sum.quantity, 4);
  await assert.rejects(service.inspectPurchaseReceipt(contract.id, first.receipt.id, inspect('inspect-down', first.receipt.items[0].id, 3), admin.id, db), (e) => e.statusCode === 400);

  const second = await service.createPurchaseReceipt(contract.id, arrival('arrival-2', 6), admin.id, db);
  const originalCount = await db.purchaseReceiptInspection.count();
  const faultingDb = { $transaction: (run, options) => db.$transaction((tx) => run({ ...tx, inventory: { ...tx.inventory, create: async () => { throw new Error('synthetic inventory failure'); } } }), options) };
  await assert.rejects(service.inspectPurchaseReceipt(contract.id, second.receipt.id, inspect('inspect-failure', second.receipt.items[0].id, 6), admin.id, faultingDb), /synthetic inventory failure/);
  assert.equal(await db.purchaseReceiptInspection.count(), originalCount);
  assert.equal((await db.purchaseReceiptItem.findUnique({ where: { id: second.receipt.items[0].id } })).acceptedQuantity, 0);
  const done = await service.inspectPurchaseReceipt(contract.id, second.receipt.id, inspect('inspect-3', second.receipt.items[0].id, 6), admin.id, db);
  assert.equal(done.status, 'RECEIVED');
  assert.equal(done.summary.complete, true);
  assert.equal((await db.inventory.aggregate({ _sum: { quantity: true } }))._sum.quantity, 10);
  assert.equal(await db.inventory.count({ where: { receiptInspectionId: null } }), 0);
  assert.equal((await service.inspectPurchaseReceipt(contract.id, second.receipt.id, inspect('inspect-3', second.receipt.items[0].id, 6), admin.id, db)).idempotentReplay, true);

  const raceContract = await createContract('SYNTHETIC-RACE');
  const races = await Promise.allSettled(['race-a', 'race-b'].map((key) => service.createPurchaseReceipt(raceContract.id, arrival(key, 6, raceContract.items[0].id), admin.id, db)));
  assert.equal(races.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal((await service.getPurchaseReceiptSummary(db, raceContract.id)).totals.arrivedQuantity, 6);
  const raceReplayContract = await createContract('SYNTHETIC-RACE-REPLAY');
  const replays = await Promise.allSettled([1, 2].map(() => service.createPurchaseReceipt(raceReplayContract.id, arrival('same-nonce', 4, raceReplayContract.items[0].id), admin.id, db)));
  assert.ok(replays.some((result) => result.status === 'fulfilled'));
  assert.equal(await db.purchaseReceipt.count({ where: { purchaseContractId: raceReplayContract.id } }), 1);
  assert.equal((await service.createPurchaseReceipt(raceReplayContract.id, arrival('same-nonce', 4, raceReplayContract.items[0].id), admin.id, db)).idempotentReplay, true);

  // 签名中谎称ADMIN仍按数据库BOSS判定；两套用户维护入口必须即时清缓存。
  const bossToken = jwt.sign({ userId: boss.id, role: 'ADMIN' }, config.jwt.secret);
  const authorization = `Bearer ${bossToken}`;
  const guard = async () => { let error; await authenticate({ headers: { authorization }, method: 'POST', originalUrl: '/api/v1/purchases' }, {}, (e) => { error = e; }); return error?.statusCode ?? 200; };
  assert.equal(await guard(), 403);
  await require('./authService').updateUser(boss.id, { role: 'ADMIN' });
  assert.equal(await guard(), 200);
  let updateError;
  await require('../controllers/userController').update({ params: { id: boss.id }, body: { role: 'BOSS' } }, { status() { return this; }, json() {} }, (e) => { updateError = e; });
  assert.equal(updateError, undefined);
  assert.equal(await guard(), 403);
  clearAuthCache(boss.id);

  const app = require('../app');
  server = await new Promise((resolve) => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const [method, url, expected] of [
    ['GET', `/api/v1/purchases/${contract.id}/receipts`, 200], ['GET', '/api/v1/finance/stats', 200],
    ['POST', `/api/v1/purchases/${contract.id}/receipts`, 403], ['POST', '/api/v1/finance/payments', 403],
    ['POST', '/api/v1/ai/chat', 403], ['POST', '/mcp', 403], ['GET', '/api/v1/purchases/export', 403],
    ['GET', '/api/v1/finance/statements/evidence/documents', 403], ['GET', '/api/v1/auth/users', 403],
  ]) {
    const response = await fetch(`${base}${url}`, { method, headers: { authorization, 'Content-Type': 'application/json' }, ...(method === 'POST' ? { body: '{}' } : {}) });
    assert.equal(response.status, expected, `${method} ${url}`);
    await response.arrayBuffer();
  }
  const period = await db.financialPeriod.create({ data: { year: 2026, month: 10, periodLabel: '合成账期', reportDate: new Date('2026-10-31') } });
  assert.ok(period.id);
  const reportResponse = await fetch(`${base}/api/v1/finance/statements/2026/10`, { headers: { authorization } });
  assert.equal(reportResponse.status, 200);
  const report = (await reportResponse.json()).data;
  for (const field of ['accountBalances', 'generalLedgerEntries', 'dataSources']) assert.equal(Object.hasOwn(report, field), false);
});
