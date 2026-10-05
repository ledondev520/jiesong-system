/** Fixture contract validation without browser execution, production data or provider calls. */
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
    env: { PATH: process.env.PATH, TMPDIR: temporaryRoot, NODE_ENV: 'test', ROLE_BROWSER_TEST_DIR: directory, ROLE_BROWSER_TEST_SCENARIO: scenario },
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
    assert.deepEqual(f.read('SELECT COUNT(*) count FROM users'), [{ count: 4 }]);
  });
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
