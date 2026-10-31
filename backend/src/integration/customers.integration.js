/** Real HTTP/RBAC/SQLite coverage for the customers API and customer-bound stores; synthetic data only. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('HTTP/SQLite: customers API roles, archive-not-delete, USD/incoterm rules and the store customer rules', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-customers-'));
  fs.chmodSync(directory, 0o700);
  const database = path.join(directory, 'synthetic.db');
  process.env.DATABASE_URL = `file:${database}`;
  process.env.UPLOAD_DIR = path.join(directory, 'uploads');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-only-customers-never-for-production';
  let db, server;
  let requestNumber = 0;
  const expectedAuditRequests = new Set();
  t.after(async () => {
    if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
    // Response-finish audit writes are async; let them land before the SQLite file is removed (flaky ENOTEMPTY otherwise).
    if (db && expectedAuditRequests.size) {
      const deadline = Date.now() + 5000;
      for (;;) {
        const saved = await db.operationLog.findMany({ where: { requestId: { in: [...expectedAuditRequests] } }, select: { requestId: true } });
        const persisted = new Set(saved.map((row) => row.requestId));
        if ([...expectedAuditRequests].every((id) => persisted.has(id))) break;
        assert.ok(Date.now() < deadline, 'customers fixture audit writes did not settle');
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
    if (db) await db.$disconnect();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  // Committed migrations only (never db push).
  const migrations = path.resolve(__dirname, '../../prisma/migrations');
  const ddl = fs.readdirSync(migrations).sort()
    .filter((name) => fs.statSync(path.join(migrations, name)).isDirectory())
    .map((name) => fs.readFileSync(path.join(migrations, name, 'migration.sql'), 'utf8')).join('\n');
  execFileSync('python3', ['-c', 'import sqlite3,sys,os; os.umask(0o077); c=sqlite3.connect(sys.argv[1]); c.executescript(sys.stdin.read()); c.close()', database], { input: ddl });
  fs.chmodSync(database, 0o600);
  db = require('../utils/prisma');
  const jwt = require('jsonwebtoken');
  const tokens = {};
  for (const role of ['ADMIN', 'SALES', 'PURCHASE', 'FINANCE', 'WAREHOUSE', 'BOSS']) {
    const user = await db.user.create({ data: { username: `synthetic-customers-${role}`, password: 'test-only-unused-hash', name: `合成${role}`, role } });
    tokens[role] = jwt.sign({ userId: user.id }, process.env.JWT_SECRET);
  }
  const port = await db.port.create({ data: { name: '合成客户港口', code: 'QA-CUST' } });
  const app = require('../app');
  server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const call = async (method, url, body, role = 'ADMIN', expected = 200) => {
    const requestId = `synthetic-customers-${++requestNumber}`;
    const response = await fetch(base + url, {
      method,
      headers: { ...(tokens[role] ? { authorization: `Bearer ${tokens[role]}` } : {}), 'Content-Type': 'application/json', 'x-request-id': requestId },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json();
    if (['POST', 'PUT', 'DELETE'].includes(method) && response.status >= 200 && response.status < 300) expectedAuditRequests.add(requestId);
    assert.equal(response.status, expected, `${role} ${method} ${url}: ${result.message || ''}`);
    return result.data;
  };
  const storeInput = (name, extra = {}) => ({ name, portId: port.id, ...extra });

  // Roles: only ADMIN and SALES write; every authenticated role (incl. BOSS) reads; anonymous gets 401.
  await call('POST', '/customers', { name: '合成匿名客户' }, 'ANONYMOUS', 401);
  for (const role of ['PURCHASE', 'FINANCE', 'WAREHOUSE', 'BOSS']) {
    await call('POST', '/customers', { name: `合成${role}客户` }, role, 403);
  }
  assert.equal(await db.customer.count(), 0, 'forbidden writes must not create a customer');
  const seapot = await call('POST', '/customers', { name: 'Synthetic Seapot', country: 'us', contactEmail: 'buyer@example.invalid' }, 'SALES');
  assert.equal(seapot.country, 'US');
  assert.equal(seapot.defaultCurrency, 'USD');
  assert.equal(seapot.defaultIncoterm, 'FOB');
  assert.equal(seapot.isActive, true);
  for (const role of ['ADMIN', 'SALES', 'PURCHASE', 'FINANCE', 'WAREHOUSE', 'BOSS']) {
    const list = await call('GET', '/customers', undefined, role);
    assert.deepEqual(list.items.map((row) => row.id), [seapot.id], role);
    assert.equal((await call('GET', `/customers/${seapot.id}`, undefined, role)).id, seapot.id);
    assert.deepEqual((await call('GET', `/customers/${seapot.id}/stores`, undefined, role)).items, []);
  }
  await call('PUT', `/customers/${seapot.id}`, { note: '老板不可改' }, 'BOSS', 403);
  await call('DELETE', `/customers/${seapot.id}`, undefined, 'ADMIN', 404); // no hard delete route exists

  // Rules: duplicate name 409; USD only; incoterm list; invalid saves change nothing.
  await call('POST', '/customers', { name: 'Synthetic Seapot' }, 'ADMIN', 409);
  const before = JSON.stringify(await db.customer.findMany());
  await call('POST', '/customers', { name: 'Synthetic EUR', defaultCurrency: 'EUR' }, 'ADMIN', 400);
  await call('POST', '/customers', { name: 'Synthetic bad term', defaultIncoterm: 'DAP' }, 'ADMIN', 400);
  await call('POST', '/customers', { name: 'Synthetic bad mail', contactEmail: 'not-an-email' }, 'ADMIN', 400);
  await call('POST', '/customers', { legalName: 'no name' }, 'ADMIN', 400);
  await call('PUT', `/customers/${seapot.id}`, { defaultIncoterm: 'cif' }, 'ADMIN', 200);
  await call('PUT', `/customers/${seapot.id}`, { defaultIncoterm: 'ZZZ' }, 'ADMIN', 400);
  await call('PUT', '/customers/does-not-exist', { note: 'x' }, 'ADMIN', 404);
  assert.notEqual(JSON.stringify(await db.customer.findMany()), before, 'only the valid CIF edit changed data');
  assert.equal((await db.customer.findUnique({ where: { id: seapot.id } })).defaultIncoterm, 'CIF');
  await call('PUT', `/customers/${seapot.id}`, { defaultIncoterm: 'FOB' }, 'ADMIN');

  // Stores: a lone active customer is adopted; code is normalised; duplicate code is 409.
  const first = await call('POST', '/stores', storeInput('合成门店一', { code: 'sac', legalName: 'Synthetic Sac LLC' }), 'SALES', 201);
  assert.equal(first.customerId, seapot.id);
  assert.equal(first.code, 'SAC');
  assert.equal(first.legalName, 'Synthetic Sac LLC');
  await call('POST', '/stores', storeInput('合成门店重复简称', { code: 'SAC' }), 'SALES', 409);
  for (const code of ['A', 'ABCDEFGHIJKLM', 'bad code', 'ab_c']) {
    await call('POST', '/stores', storeInput(`合成坏简称${code.length}`, { code }), 'SALES', 400);
  }
  assert.equal(await db.store.count(), 1, 'rejected store writes create nothing');
  const listed = await call('GET', `/customers/${seapot.id}/stores`);
  assert.deepEqual(listed.items.map((row) => row.id), [first.id]);
  assert.deepEqual((await call('GET', `/stores?customerId=${seapot.id}`)).items.map((row) => row.id), [first.id]);

  // Two active customers: customerId becomes mandatory; an archived customer takes no new stores.
  const second = await call('POST', '/customers', { name: 'Synthetic Second' }, 'ADMIN');
  await call('POST', '/stores', storeInput('合成缺客户门店'), 'SALES', 400);
  await call('POST', '/stores', storeInput('合成未知客户门店', { customerId: 'nope' }), 'SALES', 400);
  const other = await call('POST', '/stores', storeInput('合成第二客户门店', { customerId: second.id }), 'SALES', 201);
  assert.equal(other.customerId, second.id);
  await call('PUT', `/customers/${second.id}`, { isActive: false }, 'ADMIN');
  await call('POST', '/stores', storeInput('合成归档客户门店', { customerId: second.id }), 'SALES', 400);
  assert.deepEqual((await call('GET', '/customers')).items.map((row) => row.id), [seapot.id], 'archived customers are hidden by default');
  assert.equal((await call('GET', '/customers?includeArchived=true')).items.length, 2);
  assert.equal(await db.customer.count(), 2, 'archiving never deletes');
  assert.equal((await call('GET', `/customers/${second.id}/stores?includeArchived=true`)).items.length, 1);

  // Zero active customers: new stores are refused; existing stores stay editable; code can be cleared.
  await call('PUT', `/customers/${seapot.id}`, { isActive: false }, 'ADMIN');
  await call('POST', '/stores', storeInput('合成无客户门店'), 'SALES', 400);
  const edited = await call('PUT', `/stores/${first.id}`, { code: '', legalName: 'Synthetic Sac Two LLC' }, 'SALES');
  assert.equal(edited.code, null);
  assert.equal(edited.legalName, 'Synthetic Sac Two LLC');
  await call('PUT', `/stores/${first.id}`, { customerId: second.id }, 'SALES', 400); // archived target
  await call('PUT', `/customers/${seapot.id}`, { isActive: true }, 'ADMIN');
  assert.equal((await call('PUT', `/stores/${first.id}`, { code: 'sac2', customerId: seapot.id }, 'SALES')).code, 'SAC2');
});
