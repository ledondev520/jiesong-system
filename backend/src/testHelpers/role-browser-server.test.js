/** Fixture contract validation including receipt allocation and own notification state and internal tax forms, without browser execution, production data or provider calls. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const password = 'test-only-role-browser-password-never-production';

async function fixtureFor(t, scenario, temporaryRoot = os.tmpdir()) {
  const directory = fs.mkdtempSync(path.join(temporaryRoot, 'jiesong-role-browser-e2e-'));
  fs.chmodSync(directory, 0o700);
  const server = spawn(process.execPath, [path.join(__dirname, 'role-browser-server.js')], {
    // Keep os.tmpdir() consistent without inheriting provider or database credentials.
    env: { PATH: process.env.PATH, TMPDIR: temporaryRoot, TZ: 'UTC', NODE_ENV: 'test', ROLE_BROWSER_TEST_DIR: directory, ROLE_BROWSER_TEST_SCENARIO: scenario },
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  t.after(async () => {
    if (server.exitCode === null && server.signalCode === null) {
      await new Promise(resolve => {
        const timeout = setTimeout(() => server.kill('SIGKILL'), 5000);
        server.once('exit', () => { clearTimeout(timeout); resolve(); });
        server.kill('SIGTERM');
      });
    }
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const metadata = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Synthetic role fixture startup timeout')), 40000);
    server.once('message', message => { clearTimeout(timeout); resolve(message); });
    server.once('error', error => { clearTimeout(timeout); reject(error); });
    server.once('exit', () => { clearTimeout(timeout); reject(new Error('Synthetic role fixture exited before startup')); });
  });
  assert.match(metadata.baseURL, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
  assert.equal(fs.statSync(path.join(directory, 'synthetic.db')).mode & 0o777, 0o600);
  const read = (sql) => JSON.parse(execFileSync('python3', ['-c', 'import sqlite3,sys,json; c=sqlite3.connect("file:"+sys.argv[1]+"?mode=ro",uri=True); c.row_factory=sqlite3.Row; print(json.dumps([dict(row) for row in c.execute(sys.argv[2])])); c.close()', path.join(directory, 'synthetic.db'), sql], { encoding: 'utf8' }));
  const call = async (method, route, data, token) => {
    const response = await fetch(`${metadata.baseURL}/api/v1${route}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    return { status: response.status, body: await response.json(), limit: response.headers.get('x-ratelimit-limit') };
  };
  const login = async role => {
    const response = await call('POST', '/auth/login', { username: metadata.users[role].username, password });
    assert.equal(response.status, 200);
    assert.equal(response.limit, '10'); // Existing login limiter is active, without a test bypass.
    assert.equal(response.body.data.user.role, role);
    assert.equal(response.body.data.user.id, metadata.users[role].id);
    return response.body.data.token;
  };
  return { ...metadata, read, call, login };
}

test('role browser fixture: custom temporary root starts with private SQLite and real login', { timeout: 60000 }, async t => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-role-fixture-root-'));
  fs.chmodSync(temporaryRoot, 0o700);
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  // The nested fixture closes before its parent temporary root is removed.
  await t.test('child preserves the selected temporary root', async child => {
    const f = await fixtureFor(child, 'purchase', temporaryRoot);
    await f.login('PURCHASE');
    assert.deepEqual(f.read('SELECT COUNT(*) count FROM users'), [{ count: 5 }]);
  });
});

test('role browser fixture: own notification mark-one persists once under repeated HTTP completion', { timeout: 60000 }, async t => {
  const f = await fixtureFor(t, 'notification-state');
  const token = await f.login('PURCHASE');
  const before = f.read('SELECT * FROM notifications ORDER BY id');
  assert.equal(before.length, 4);
  assert.ok(before.every(row => row.userId === f.users.PURCHASE.id));
  assert.equal(before.filter(row => !row.isRead).length, 3);
  const notification = before.find(row => row.title === '合成通知 1');
  const results = await Promise.all([
    f.call('POST', `/notifications/${notification.id}/read`, undefined, token),
    f.call('POST', `/notifications/${notification.id}/read`, undefined, token),
  ]);
  results.forEach(response => assert.equal(response.status, 200));
  assert.deepEqual(f.read('SELECT * FROM notifications ORDER BY id'), before.map(row => row.id === notification.id ? { ...row, isRead: 1 } : row));
  const count = await f.call('GET', '/notifications/unread-count', undefined, token);
  assert.equal(count.status, 200);
  assert.equal(count.body.data.count, 2);
});

test('role browser fixture: PURCHASE authenticates and arrival is persisted without eligible stock', { timeout: 60000 }, async t => {
  const f = await fixtureFor(t, 'purchase');
  const token = await f.login('PURCHASE');
  const response = await f.call('POST', `/purchases/${f.purchaseId}/receipts`, {
    requestId: 'synthetic-local-arrival', arrivedAt: '2026-10-01', note: '合成到货',
    items: [{ purchaseItemId: f.purchaseItemId, arrivedQuantity: 40 }],
  }, token);
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.data.summary.totals, { orderedQuantity: 100, arrivedQuantity: 40, acceptedQuantity: 0, pendingQuantity: 40, reinspectionQuantity: 0 });
  assert.deepEqual(f.read('SELECT createdById FROM purchase_receipts'), [{ createdById: f.users.PURCHASE.id }]);
  assert.deepEqual(f.read('SELECT quantity FROM inventories'), []);
});

test('role browser fixture: WAREHOUSE inspection persists operator, held quantity and sourced inventory', { timeout: 60000 }, async t => {
  const f = await fixtureFor(t, 'warehouse');
  const token = await f.login('WAREHOUSE');
  const response = await f.call('POST', `/purchases/${f.purchaseId}/receipts/${f.receiptId}/inspection`, {
    requestId: 'synthetic-local-inspection', note: '合成部分合格',
    items: [{ receiptItemId: f.receiptItemId, acceptedQuantity: 30, reinspectionQuantity: 10 }],
  }, token);
  assert.equal(response.status, 200);
  assert.deepEqual(f.read('SELECT inspectedById,acceptedIncrement,pendingQuantity,reinspectionQuantity FROM purchase_receipt_inspections'), [{ inspectedById: f.users.WAREHOUSE.id, acceptedIncrement: 30, pendingQuantity: 0, reinspectionQuantity: 10 }]);
  const rows = f.read('SELECT quantity,status,purchaseItemId,receiptInspectionId FROM inventories');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].quantity, 30);
  assert.equal(rows[0].status, 'INBOUND');
  assert.equal(rows[0].purchaseItemId, f.purchaseItemId);
  assert.ok(rows[0].receiptInspectionId);
  assert.equal((await f.call('GET', '/inventory', undefined, token)).status, 200);
});

test('role browser fixture: SALES guard rolls back, warehouse releases stock and shipping is idempotent', { timeout: 60000 }, async t => {
  const f = await fixtureFor(t, 'sales');
  const sales = await f.login('SALES');
  assert.equal((await f.call('POST', `/purchases/${f.purchaseId}/receipts`, {}, sales)).status, 403);
  const rejected = await f.call('PUT', `/sales/${f.salesId}/status`, { status: 'SHIPPED' }, sales);
  assert.equal(rejected.status, 400);
  assert.match(rejected.body.message, /库存不足/);
  assert.deepEqual(f.read('SELECT status,shippedAt FROM sales_contracts'), [{ status: 'PACKING', shippedAt: null }]);
  assert.deepEqual(f.read('SELECT quantity,status FROM inventories'), [{ quantity: 30, status: 'INBOUND' }]);
  const warehouse = await f.login('WAREHOUSE');
  const inspected = await f.call('POST', `/purchases/${f.purchaseId}/receipts/${f.receiptId}/inspection`, {
    requestId: 'synthetic-local-release', note: '合成复验合格60件',
    items: [{ receiptItemId: f.receiptItemId, acceptedQuantity: 60, reinspectionQuantity: 40 }],
  }, warehouse);
  assert.equal(inspected.status, 200);
  assert.equal((await f.call('PUT', `/sales/${f.salesId}/status`, { status: 'SHIPPED' }, sales)).status, 200);
  const rows = f.read('SELECT status,SUM(quantity) quantity FROM inventories GROUP BY status ORDER BY status');
  assert.deepEqual(rows, [{ status: 'INBOUND', quantity: 10 }, { status: 'OUTBOUND', quantity: 50 }]);
  const sources = f.read('SELECT i.receiptInspectionId,p.id inspectionId FROM inventories i LEFT JOIN purchase_receipt_inspections p ON p.id=i.receiptInspectionId');
  assert.ok(sources.every(row => row.receiptInspectionId && row.receiptInspectionId === row.inspectionId));
  assert.equal((await f.call('PUT', `/sales/${f.salesId}/status`, { status: 'SHIPPED' }, sales)).status, 200);
  assert.deepEqual(f.read('SELECT status,SUM(quantity) quantity FROM inventories GROUP BY status ORDER BY status'), rows);
});

test('role browser fixture: BOSS permitted reads succeed and attempted mutation preserves DB', { timeout: 60000 }, async t => {
  const f = await fixtureFor(t, 'boss');
  const boss = await f.login('BOSS');
  for (const route of [`/purchases/${f.purchaseId}`, `/purchases/${f.purchaseId}/receipts`, `/sales/${f.salesId}`, `/contracts/${f.salesId}/files?contractType=SALES`]) {
    assert.equal((await f.call('GET', route, undefined, boss)).status, 200);
  }
  const before = f.read('SELECT status,shippedAt FROM sales_contracts');
  const denied = await f.call('PUT', `/sales/${f.salesId}/status`, { status: 'SHIPPED' }, boss);
  assert.equal(denied.status, 403);
  assert.match(denied.body.message, /老板角色仅可查看业务/);
  assert.deepEqual(f.read('SELECT status,shippedAt FROM sales_contracts'), before);
});

const readPool = f => ({
  payments: f.read('SELECT id,type,sourcePaymentId,salesContractId,amount,currency,customerName,paymentMethod,paymentDate,note FROM payments ORDER BY id'),
  contracts: f.read('SELECT id,contractNo,totalAmount,receivedAmount FROM sales_contracts ORDER BY contractNo'),
});

test('role browser fixture: FINANCE partial split preserves source and readback consumes only remainder', { timeout: 60000 }, async t => {
  const f = await fixtureFor(t, 'receipt-pool');
  const finance = await f.login('FINANCE');
  const { usdReceiptId, cnyReceiptId, contracts: [first, second] } = f.receiptPool;
  const original = readPool(f).payments.find(row => row.id === usdReceiptId);
  const split = await f.call('POST', `/finance/payments/${usdReceiptId}/allocate`, {
    allocations: [{ salesContractId: first.id, amount: 300 }, { salesContractId: second.id, amount: 200 }],
  }, finance);
  assert.equal(split.status, 200);
  const partial = readPool(f);
  assert.deepEqual(partial.payments.find(row => row.id === usdReceiptId), original);
  const allocations = partial.payments.filter(row => row.sourcePaymentId === usdReceiptId);
  assert.equal(allocations.length, 2);
  assert.deepEqual(allocations.map(row => [row.salesContractId, row.amount]).sort(), [[first.id, 300], [second.id, 200]].sort());
  assert.ok(allocations.every(row => row.type === 'RECEIVABLE_COLLECTION' && row.currency === 'USD'));
  assert.deepEqual(partial.contracts.map(row => row.receivedAmount), [300, 200]);
  const pool = await f.call('GET', '/finance/unallocated-payments', undefined, finance);
  assert.equal(pool.status, 200);
  assert.equal(pool.body.data.find(row => row.id === usdReceiptId).remainingAmount, 500);
  const contract = await f.call('GET', `/sales/${first.id}`, undefined, finance);
  assert.equal(contract.status, 200);
  assert.equal(contract.body.data.receivedAmount, 300);
  const receivables = await f.call('GET', '/finance/receivables?page=1&pageSize=100&outstandingOnly=true', undefined, finance);
  assert.equal(receivables.status, 200);
  assert.deepEqual(receivables.body.data.items.map(row => [row.contractNo, row.receivedAmount, row.unreceiveAmount]).sort(), [[first.contractNo, 300, 500], [second.contractNo, 200, 800]].sort());
  const remainder = await f.call('POST', `/finance/payments/${usdReceiptId}/allocate`, {
    allocations: [{ salesContractId: second.id, amount: 500 }],
  }, finance);
  assert.equal(remainder.status, 200);
  const full = readPool(f);
  assert.deepEqual(full.payments.find(row => row.id === usdReceiptId), { ...original, type: 'RECEIVABLE_RECEIPT_ALLOCATED' });
  assert.equal(full.payments.filter(row => row.sourcePaymentId === usdReceiptId).length, 3);
  assert.equal(full.payments.filter(row => row.sourcePaymentId === usdReceiptId).reduce((sum, row) => sum + row.amount, 0), original.amount);
  assert.deepEqual(full.contracts.map(row => row.receivedAmount), [300, 700]);
  const remainingPool = await f.call('GET', '/finance/unallocated-payments', undefined, finance);
  assert.equal(remainingPool.status, 200);
  assert.deepEqual(remainingPool.body.data.map(row => [row.id, row.remainingAmount]), [[cnyReceiptId, 500]]);
});

test('role browser fixture: FINANCE rejected CNY retries preserve both source and contracts', { timeout: 60000 }, async t => {
  const f = await fixtureFor(t, 'receipt-pool');
  const finance = await f.login('FINANCE');
  const { cnyReceiptId, contracts: [contract] } = f.receiptPool;
  const before = readPool(f);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const rejected = await f.call('POST', `/finance/payments/${cnyReceiptId}/allocate`, {
      allocations: [{ salesContractId: contract.id, amount: 125 }],
    }, finance);
    assert.equal(rejected.status, 400);
    assert.match(rejected.body.message, /只支持 USD/);
    assert.deepEqual(readPool(f), before);
  }
});

test('role browser fixture: BOSS reads receipt balances but allocation and automatch are forbidden', { timeout: 60000 }, async t => {
  const f = await fixtureFor(t, 'receipt-pool');
  const boss = await f.login('BOSS');
  const { usdReceiptId, contracts: [contract] } = f.receiptPool;
  const before = readPool(f);
  for (const route of ['/finance/unallocated-payments', '/finance/receivables', `/sales/${contract.id}`]) {
    assert.equal((await f.call('GET', route, undefined, boss)).status, 200);
  }
  for (const [route, data] of [
    [`/finance/payments/${usdReceiptId}/allocate`, { allocations: [{ salesContractId: contract.id, amount: 100 }] }],
    ['/finance/payments/auto-match', {}],
  ]) {
    const denied = await f.call('POST', route, data, boss);
    assert.equal(denied.status, 403);
    assert.match(denied.body.message, /老板角色仅可查看业务/);
    assert.deepEqual(readPool(f), before);
  }
});

for (const kind of ['customs', 'refunds']) {
  test(`role browser fixture: FINANCE internal ${kind} forms use migrated SQLite, reject duplicate then create/edit/read back`, { timeout: 60000 }, async t => {
    const f = await fixtureFor(t, 'tax-record-forms');
    const token = await f.login('FINANCE');
    const seed = f.taxRecords;
    const route = kind === 'customs' ? '/customs-declarations' : '/tax-refunds';
    const table = kind === 'customs' ? 'customs_declarations' : 'tax_refunds';
    const numberField = kind === 'customs' ? 'declarationNo' : 'refundNo';
    const payload = kind === 'customs' ? {
      declarationNo: seed.customsNo, salesContractId: seed.contractId, status: 'DRAFT',
      declaredAt: '2026-10-02', exportDate: '2026-10-03', customsBroker: '合成内部报关行', currency: 'USD', exchangeRate: 7.2,
      totalAmount: 200, totalQuantity: 20, totalGrossWeight: 24, totalNetWeight: 20, note: '合成新建记录',
      items: [{ productId: f.productId, itemNo: 1, customsName: '合成内部表单商品', hsCode: '9999999999', quantity: 20, unit: '件', unitPrice: 10, totalPrice: 200, declarationElements: '合成申报要素' }],
    } : {
      refundNo: seed.refundNo, salesContractId: seed.contractId, customsDeclarationId: seed.customsId, forexVerificationId: null, status: 'DRAFT',
      declaredAmount: 200, refundableAmount: 26, refundedAmount: 0, appliedAt: '2026-10-02', refundedAt: null, note: '合成新建记录',
    };
    const snapshot = () => ({
      customs: f.read('SELECT * FROM customs_declarations ORDER BY id'),
      items: f.read('SELECT * FROM customs_declaration_items ORDER BY id'),
      refunds: f.read('SELECT * FROM tax_refunds ORDER BY id'),
      audit: f.read("SELECT * FROM operation_logs WHERE entity IN ('CustomsDeclaration','TaxRefund') ORDER BY id"),
    });
    const before = snapshot();
    assert.ok(f.read('SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL').length > 10);
    assert.equal((await f.call('POST', route, payload, token)).status, 500);
    assert.deepEqual(snapshot(), before);
    payload[numberField] = `${kind === 'customs' ? 'CD' : 'TR'}-SYNTHETIC-HTTP-NEW`;
    const created = await f.call('POST', route, payload, token);
    assert.equal(created.status, 201);
    const id = created.body.data.id;
    const waitAudit = async count => {
      const deadline = Date.now() + 5000;
      while (snapshot().audit.length !== count && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
      assert.equal(snapshot().audit.length, count);
    };
    await waitAudit(1);
    const saved = snapshot();
    assert.equal(f.read(`SELECT * FROM ${table}`).length, 2);
    assert.equal(saved.audit[0].userId, f.users.FINANCE.id);
    assert.equal(saved.audit[0].entityId, id);
    const readback = await f.call('GET', `${route}/${id}`, undefined, token);
    assert.equal(readback.status, 200);
    const dateField = kind === 'customs' ? 'declaredAt' : 'appliedAt';
    assert.equal(readback.body.data[dateField], '2026-10-02T00:00:00.000Z');
    const editedPayload = { ...payload, note: '合成内部记录编辑后备注' };
    if (kind === 'customs') editedPayload.items = readback.body.data.items.map(({ id: itemId }) => ({ ...payload.items[0], id: itemId }));
    const updated = await f.call('PUT', `${route}/${id}`, editedPayload, token);
    assert.equal(updated.status, 200);
    await waitAudit(2);
    const edited = snapshot();
    const record = f.read(`SELECT * FROM ${table}`).find(row => row.id === id);
    const original = (kind === 'customs' ? saved.customs : saved.refunds).find(row => row.id === id);
    assert.deepEqual({ ...record, updatedAt: original.updatedAt }, { ...original, note: editedPayload.note });
    if (kind === 'customs') {
      const item = edited.items.find(row => row.customsDeclarationId === id);
      const prior = saved.items.find(row => row.customsDeclarationId === id);
      assert.deepEqual({ ...item, updatedAt: prior.updatedAt }, prior);
    }
    assert.equal(edited.audit[1].action, 'UPDATE');
    assert.equal(edited.audit[1].userId, f.users.FINANCE.id);
    const reloaded = await f.call('GET', `${route}/${id}`, undefined, token);
    assert.equal(reloaded.status, 200);
    assert.equal(reloaded.body.data.note, editedPayload.note);
    assert.equal(reloaded.body.data[dateField], '2026-10-02T00:00:00.000Z');
    assert.equal(reloaded.body.data.status, 'DRAFT');
    if (kind === 'refunds') assert.equal(reloaded.body.data.refundedAmount, 0);
    assert.deepEqual(snapshot(), edited);
  });
}
