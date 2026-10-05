/** 采购异常 HTTP/SQLite 回归；临时合成数据库、真实路由认证，不使用 API/事务替身。 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, fork } = require('node:child_process');

test('HTTP/SQLite：采购并发到货、累计复验、整批回滚及采购角色边界', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-purchase-exceptions-'));
  fs.chmodSync(directory, 0o700);
  const dbFile = path.join(directory, 'synthetic.db');
  process.env.DATABASE_URL = `file:${dbFile}`;
  process.env.UPLOAD_DIR = path.join(directory, 'uploads');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-only-purchase-exceptions-never-for-production';
  let db, server, secondServer, secondBase;
  t.after(async () => {
    if (secondServer && secondServer.exitCode === null) {
      const exited = new Promise(resolve => secondServer.once('exit', resolve));
      secondServer.kill('SIGTERM');
      await exited;
    }
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
  for (const role of ['PURCHASE', 'WAREHOUSE', 'SALES', 'FINANCE']) {
    const user = await db.user.create({ data: { username: `synthetic-exception-${role}`, password: 'test-only-unused-hash', name: `合成${role}`, role } });
    users[role] = { ...user, token: jwt.sign({ userId: user.id }, config.jwt.secret) };
  }
  const supplier = await db.supplier.create({ data: { name: '合成异常供应商', taxId: 'SYNTHETIC-EXCEPTION-TAX-ID' } });
  const products = await Promise.all([1, 2].map(index => db.product.create({ data: { customsName: `SYNTHETIC EXCEPTION WIDGET ${index}`, unit: '件', hsCode: '9999999999', declaration: '合成测试要素' } })));
  const app = require('../app');
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const request = async (method, url, body, role = 'PURCHASE', serverBase = base) => {
    const response = await fetch(serverBase + url, { method, headers: { authorization: `Bearer ${users[role].token}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  };
  const call = async (method, url, body, expected = 200, role = 'PURCHASE', serverBase = base) => {
    const result = await request(method, url, body, role, serverBase);
    assert.equal(result.status, expected, `${method} ${url}: ${result.body.message || result.body.error || ''}`);
    return result.body.data;
  };
  const create = async (quantities = [10]) => {
    const result = await call('POST', '/purchases', { supplierId: supplier.id, taxRate: 13, items: quantities.map((quantity, index) => ({ productId: products[index].id, quantity, unit: '件', unitPrice: 10 })) }, 201);
    const contract = result.contract || result;
    await call('PUT', `/purchases/${contract.id}/status`, { status: 'SIGNED' });
    await call('PUT', `/purchases/${contract.id}/production-details`, { completeProduction: true, items: contract.items.map(item => ({ id: item.id, specification: '合成箱', boxes: 2, grossWeight: 20, netWeight: 18, volume: 0.2 })) });
    await call('PUT', `/purchases/${contract.id}/status`, { status: 'SHIPPED' });
    return contract;
  };
  const arrival = (contract, requestId, quantities = [10]) => ({ requestId, arrivedAt: '2026-10-01', note: '合成到货', items: quantities.map((arrivedQuantity, index) => ({ purchaseItemId: contract.items[index].id, arrivedQuantity })) });
  const receiptUrl = contract => `/purchases/${contract.id}/receipts`;
  const inspectionUrl = (contract, receipt) => `${receiptUrl(contract)}/${receipt.id}/inspection`;
  const inspection = (receipt, requestId, accepted, reinspection = 0) => ({ requestId, note: '合成验货说明', items: [{ receiptItemId: receipt.items[0].id, acceptedQuantity: accepted, reinspectionQuantity: reinspection }] });
  const snapshot = async contract => ({
    contract: await db.purchaseContract.findUnique({ where: { id: contract.id } }),
    receipts: await db.purchaseReceipt.findMany({ where: { purchaseContractId: contract.id }, orderBy: { id: 'asc' } }),
    items: await db.purchaseReceiptItem.findMany({ where: { receipt: { purchaseContractId: contract.id } }, orderBy: { id: 'asc' } }),
    inspections: await db.purchaseReceiptInspection.findMany({ where: { receipt: { purchaseContractId: contract.id } }, orderBy: { id: 'asc' } }),
    inventory: await db.inventory.findMany({ where: { purchaseItem: { purchaseContractId: contract.id } }, orderBy: { id: 'asc' } }),
  });

  await t.test('相同请求并发到货只落一批，内容冲突返回409且不能多记数量', async () => {
    const contract = await create();
    const input = { ...arrival(contract, 'parallel-arrival'), createdById: users.SALES.id };
    const results = await Promise.all(Array.from({ length: 3 }, () => request('POST', receiptUrl(contract), input)));
    assert.deepEqual(results.map(result => result.status), [200, 200, 200]);
    assert.equal(results.filter(result => result.body.data.idempotentReplay === false).length, 1);
    assert.equal(new Set(results.map(result => result.body.data.receipt.id)).size, 1);
    const before = await snapshot(contract);
    assert.equal(before.receipts.length, 1);
    assert.equal(before.receipts[0].createdById, users.PURCHASE.id);
    assert.equal(before.items[0].arrivedQuantity, 10);
    assert.equal(before.inventory.length, 0);
    await call('POST', receiptUrl(contract), arrival(contract, 'parallel-arrival', [9]), 409);
    assert.deepEqual(await snapshot(contract), before);
  });

  await t.test('相同requestId并发不同内容只有一份成功，合法不同批次可同时到齐', async () => {
    const conflict = await create();
    const conflicting = await Promise.all([4, 6].map(count => request('POST', receiptUrl(conflict), arrival(conflict, 'parallel-content-conflict', [count]))));
    assert.deepEqual(conflicting.map(result => result.status).sort(), [200, 409]);
    const saved = await snapshot(conflict);
    assert.equal(saved.receipts.length, 1);
    assert.equal(saved.items[0].arrivedQuantity, conflicting.find(result => result.status === 200).body.data.receipt.items[0].arrivedQuantity);
    const completeArrival = await create();
    const complementary = await Promise.all([4, 6].map(count => request('POST', receiptUrl(completeArrival), arrival(completeArrival, `complementary-${count}`, [count]))));
    assert.deepEqual(complementary.map(result => result.status), [200, 200]);
    const summary = await call('GET', receiptUrl(completeArrival));
    assert.equal(summary.summary.items[0].arrivedQuantity, 10);
    assert.equal(summary.summary.items[0].pendingQuantity, 10);
    assert.equal(summary.summary.items[0].remainingQuantity, 0);
    assert.equal(summary.summary.complete, false);
    assert.equal((await snapshot(completeArrival)).inventory.length, 0);
  });

  await t.test('不同并发到货不得超订；多商品中任何一行超量整批回滚', async () => {
    const contract = await create();
    const results = await Promise.all(['over-a', 'over-b'].map(requestId => request('POST', receiptUrl(contract), arrival(contract, requestId, [6]))));
    assert.deepEqual(results.map(result => result.status).sort(), [200, 400]);
    const saved = await snapshot(contract);
    assert.equal(saved.receipts.length, 1);
    assert.equal(saved.items.reduce((sum, item) => sum + item.arrivedQuantity, 0), 6);
    assert.equal(saved.inventory.length, 0);
    const multi = await create([10, 5]);
    await call('POST', receiptUrl(multi), arrival(multi, 'initial-multi', [8, 3]));
    const before = await snapshot(multi);
    await call('POST', receiptUrl(multi), arrival(multi, 'invalid-multi', [2, 3]), 400);
    assert.deepEqual(await snapshot(multi), before);
    const final = await call('POST', receiptUrl(multi), arrival(multi, 'final-multi', [2, 2]));
    assert.deepEqual(final.summary.items.map(item => item.arrivedQuantity), [10, 5]);
    assert.equal(final.summary.complete, false);
  });

  await t.test('并发重复验货只生成合格增量；复验为累计量，完成后仍可重放', async () => {
    const contract = await create();
    const { receipt } = await call('POST', receiptUrl(contract), arrival(contract, 'inspection-arrival'));
    const input = { ...inspection(receipt, 'parallel-inspect', 6, 4), inspectedById: users.SALES.id };
    const results = await Promise.all(Array.from({ length: 3 }, () => request('POST', inspectionUrl(contract, receipt), input)));
    assert.deepEqual(results.map(result => result.status), [200, 200, 200]);
    assert.equal(results.filter(result => result.body.data.idempotentReplay === false).length, 1);
    let saved = await snapshot(contract);
    assert.equal(saved.inspections.length, 1);
    assert.equal(saved.inspections[0].acceptedIncrement, 6);
    assert.equal(saved.inspections[0].inspectedById, users.PURCHASE.id);
    assert.equal(saved.inventory.length, 1);
    assert.equal(saved.inventory[0].quantity, 6);
    assert.equal(saved.contract.status, 'SHIPPED');
    const unchanged = await call('POST', inspectionUrl(contract, receipt), inspection(receipt, 'same-cumulative-count', 6, 4));
    assert.equal(unchanged.summary.items[0].acceptedQuantity, 6);
    saved = await snapshot(contract);
    assert.equal(saved.inspections.find(row => row.requestId === 'same-cumulative-count').acceptedIncrement, 0);
    assert.equal(saved.inventory.length, 1);
    const finish = inspection(receipt, 'inspection-final', 10);
    const completed = await call('POST', inspectionUrl(contract, receipt), finish);
    assert.equal(completed.status, 'RECEIVED');
    assert.equal(completed.summary.complete, true);
    const before = await snapshot(contract);
    assert.equal(before.inspections.reduce((sum, row) => sum + row.acceptedIncrement, 0), 10);
    assert.equal(before.inventory.reduce((sum, row) => sum + row.quantity, 0), 10);
    assert.deepEqual(before.inventory.map(row => row.quantity).sort((a, b) => a - b), [4, 6]);
    assert.equal((await call('POST', inspectionUrl(contract, receipt), finish)).idempotentReplay, true);
    assert.equal((await call('POST', receiptUrl(contract), arrival(contract, 'inspection-arrival'))).idempotentReplay, true);
    await call('POST', inspectionUrl(contract, receipt), { ...finish, note: '合成不同内容' }, 409);
    assert.deepEqual(await snapshot(contract), before);
  });

  await t.test('不同并发验货保持累计单调，不重复入库且失败请求可安全刷新重试', async () => {
    const contract = await create();
    const { receipt } = await call('POST', receiptUrl(contract), arrival(contract, 'race-inspection-arrival'));
    const inputs = [inspection(receipt, 'race-6', 6, 4), inspection(receipt, 'race-8', 8, 2)];
    const results = await Promise.all(inputs.map(input => request('POST', inspectionUrl(contract, receipt), input)));
    for (const result of results) assert.ok([200, 400, 409].includes(result.status), `unexpected concurrency HTTP ${result.status}`);
    assert.ok(results.some(result => result.status === 200));
    const saved = await snapshot(contract);
    assert.ok([6, 8].includes(saved.items[0].acceptedQuantity));
    assert.equal(saved.inventory.reduce((sum, row) => sum + row.quantity, 0), saved.items[0].acceptedQuantity);
    assert.equal(saved.inspections.reduce((sum, row) => sum + row.acceptedIncrement, 0), saved.items[0].acceptedQuantity);
    if (saved.items[0].acceptedQuantity === 6) await call('POST', inspectionUrl(contract, receipt), inputs[1]);
    const result = await call('GET', receiptUrl(contract));
    assert.equal(result.summary.items[0].acceptedQuantity, 8);
    assert.equal(result.summary.items[0].reinspectionQuantity, 2);
    assert.equal(result.summary.items[0].pendingQuantity, 0);
    assert.equal(result.status, 'SHIPPED');
  });

  await t.test('两个真实HTTP进程对同一SQLite并发重试仍只记一次到货与验货', async () => {
    secondServer = fork(path.resolve(__dirname, '../testHelpers/purchase-receipt-server.js'), [], { env: { ...process.env, PURCHASE_EXCEPTION_TEST_DIR: directory }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    secondBase = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Synthetic purchase worker startup timeout')), 15000);
      secondServer.once('message', message => { clearTimeout(timeout); resolve(message.baseURL); });
      secondServer.once('exit', code => { clearTimeout(timeout); reject(new Error(`Synthetic purchase worker exited: ${code}`)); });
    });
    const contract = await create();
    const arrived = arrival(contract, 'two-process-arrival');
    const arrivals = await Promise.all([base, secondBase].map(serverBase => request('POST', receiptUrl(contract), arrived, 'PURCHASE', serverBase)));
    assert.deepEqual(arrivals.map(result => result.status), [200, 200]);
    assert.equal(arrivals.filter(result => result.body.data.idempotentReplay === false).length, 1);
    const receipt = arrivals[0].body.data.receipt;
    const inspected = inspection(receipt, 'two-process-inspection', 10);
    const inspections = await Promise.all([base, secondBase].map(serverBase => request('POST', inspectionUrl(contract, receipt), inspected, 'PURCHASE', serverBase)));
    assert.deepEqual(inspections.map(result => result.status), [200, 200]);
    assert.equal(inspections.filter(result => result.body.data.idempotentReplay === false).length, 1);
    const saved = await snapshot(contract);
    assert.equal(saved.receipts.length, 1);
    assert.equal(saved.inspections.length, 1);
    assert.equal(saved.inventory.length, 1);
    assert.equal(saved.inventory[0].quantity, 10);
    assert.equal(saved.contract.status, 'RECEIVED');
  });

  await t.test('累计回退、超量、重复行与跨批次引用拒绝；整批验证不落部分库存', async () => {
    const contract = await create([10, 5]);
    const { receipt } = await call('POST', receiptUrl(contract), arrival(contract, 'validation-arrival', [10, 5]));
    const byPurchaseId = new Map(receipt.items.map(item => [item.purchaseItemId, item]));
    const rows = contract.items.map(item => byPurchaseId.get(item.id));
    await call('POST', inspectionUrl(contract, receipt), { requestId: 'validation-initial', note: '合成初验', items: rows.map(row => ({ receiptItemId: row.id, acceptedQuantity: 2, reinspectionQuantity: 1 })) });
    const before = await snapshot(contract);
    const invalid = [
      [{ receiptItemId: rows[0].id, acceptedQuantity: 1, reinspectionQuantity: 0 }],
      [{ receiptItemId: rows[0].id, acceptedQuantity: 8, reinspectionQuantity: 3 }],
      [{ receiptItemId: rows[0].id, acceptedQuantity: 3, reinspectionQuantity: 0 }, { receiptItemId: rows[0].id, acceptedQuantity: 3, reinspectionQuantity: 0 }],
      [{ receiptItemId: rows[0].id, acceptedQuantity: 3, reinspectionQuantity: 0 }, { receiptItemId: rows[1].id, acceptedQuantity: 6, reinspectionQuantity: 0 }],
    ];
    for (const [index, items] of invalid.entries()) {
      await call('POST', inspectionUrl(contract, receipt), { requestId: `invalid-count-${index}`, note: '合成无效验货', items }, 400);
      assert.deepEqual(await snapshot(contract), before);
    }
    const foreign = await create();
    const other = await call('POST', receiptUrl(foreign), arrival(foreign, 'foreign-arrival'));
    await call('POST', inspectionUrl(contract, receipt), inspection(other.receipt, 'cross-item', 1), 400);
    await call('POST', inspectionUrl(contract, other.receipt), inspection(other.receipt, 'cross-receipt', 1), 404);
    assert.deepEqual(await snapshot(contract), before);
  });

  await t.test('实际库存SQL失败完整回滚验货、累计量和合同；原请求可重新成功', async () => {
    const contract = await create();
    const { receipt } = await call('POST', receiptUrl(contract), arrival(contract, 'sql-failure-arrival'));
    const input = inspection(receipt, 'sql-failure-inspect', 10);
    const before = await snapshot(contract);
    await db.$executeRawUnsafe(`CREATE TRIGGER synthetic_receipt_stock_failure BEFORE INSERT ON inventories WHEN NEW.quantity = 10 BEGIN SELECT RAISE(ABORT, 'synthetic receipt inventory failure'); END`);
    try { await call('POST', inspectionUrl(contract, receipt), input, 500); }
    finally { await db.$executeRawUnsafe('DROP TRIGGER synthetic_receipt_stock_failure'); }
    assert.deepEqual(await snapshot(contract), before);
    const retried = await call('POST', inspectionUrl(contract, receipt), input);
    assert.equal(retried.status, 'RECEIVED');
    assert.equal(retried.idempotentReplay, false);
    const saved = await snapshot(contract);
    assert.equal(saved.inspections.length, 1);
    assert.equal(saved.inventory.length, 1);
    assert.equal(saved.inventory[0].quantity, 10);
  });

  await t.test('采购真实认证拒绝财务报表/银行导入/核销/退税确认/管理写入', async () => {
    const calls = [
      ['POST', '/finance/statements/import-file/confirm'],
      ['POST', '/finance/statements/import-bundle/confirm'],
      ['POST', '/bank-flow/import'],
      ['POST', '/bank-flow/invoices/import'],
      ['POST', '/forex-verifications'],
      ['PUT', '/forex-verifications/synthetic-unavailable'],
      ['POST', '/tax-refunds'],
      ['POST', '/tax-refunds/auto-drafts'],
      ['PUT', '/tax-refunds/synthetic-unavailable'],
      ['POST', '/tax-refunds/workbench/synthetic-unavailable/confirm'],
      ['POST', '/users'],
      ['PUT', '/system/configs/synthetic-unavailable'],
    ];
    const before = { payment: await db.payment.count(), taxRefund: await db.taxRefund.count(), forex: await db.forexVerification.count(), users: await db.user.count() };
    // 独立进程仍执行完整认证/RBAC，避免本文件正常高密度请求触达单进程100次限流。
    for (const [method, url] of calls) await call(method, url, {}, 403, 'PURCHASE', secondBase);
    assert.deepEqual({ payment: await db.payment.count(), taxRefund: await db.taxRefund.count(), forex: await db.forexVerification.count(), users: await db.user.count() }, before);
    const contract = await create();
    const input = arrival(contract, 'forbidden-receipt');
    for (const role of ['SALES', 'FINANCE']) await call('POST', receiptUrl(contract), input, 403, role);
    const saved = await snapshot(contract);
    assert.equal(saved.receipts.length, 0);
    assert.equal(saved.inventory.length, 0);
    const { receipt } = await call('POST', receiptUrl(contract), input, 200, 'PURCHASE', secondBase);
    const beforeInspection = await snapshot(contract);
    for (const role of ['SALES', 'FINANCE']) await call('POST', inspectionUrl(contract, receipt), inspection(receipt, 'forbidden-inspection', 10), 403, role, secondBase);
    assert.deepEqual(await snapshot(contract), beforeInspection);
  });
});
