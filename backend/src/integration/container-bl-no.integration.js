/** A81: SalesContract (the container) blNo round-trip over real HTTP/SQLite, WAREHOUSE read, additive-only migration; synthetic data only. */
const test = require('node:test');
const { dbRole } = require('../testHelpers/od8Personas');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const MIGRATION = '20261109010000_add_sales_contract_bl_no';

test('migration is additive only: one nullable ADD COLUMN on sales_contracts', () => {
  const sql = fs.readFileSync(path.resolve(__dirname, `../../prisma/migrations/${MIGRATION}/migration.sql`), 'utf8');
  const statements = sql.split('\n').filter((line) => line.trim() && !line.startsWith('--'));
  assert.deepEqual(statements, ['ALTER TABLE "sales_contracts" ADD COLUMN "blNo" TEXT;']);
});

test('HTTP/SQLite: blNo update/get/list, WAREHOUSE can read it, bad values rejected', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-blno-'));
  fs.chmodSync(directory, 0o700);
  const database = path.join(directory, 'synthetic.db');
  process.env.DATABASE_URL = `file:${database}`;
  process.env.UPLOAD_DIR = path.join(directory, 'uploads');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-only-blno-never-for-production';
  let db, server;
  let requestNumber = 0;
  const expectedAuditRequests = new Set();
  t.after(async () => {
    if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
    // Response-finish audit writes are async; let them land before the SQLite file is removed.
    if (db && expectedAuditRequests.size) {
      const deadline = Date.now() + 5000;
      for (;;) {
        const saved = await db.operationLog.findMany({ where: { requestId: { in: [...expectedAuditRequests] } }, select: { requestId: true } });
        const persisted = new Set(saved.map((row) => row.requestId));
        if ([...expectedAuditRequests].every((id) => persisted.has(id))) break;
        assert.ok(Date.now() < deadline, 'blNo fixture audit writes did not settle');
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
    if (db) await db.$disconnect();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const migrations = path.resolve(__dirname, '../../prisma/migrations');
  const ddl = fs.readdirSync(migrations).sort()
    .filter((name) => fs.statSync(path.join(migrations, name)).isDirectory())
    .map((name) => fs.readFileSync(path.join(migrations, name, 'migration.sql'), 'utf8')).join('\n');
  execFileSync('python3', ['-c', 'import sqlite3,sys,os; os.umask(0o077); c=sqlite3.connect(sys.argv[1]); c.executescript(sys.stdin.read()); c.close()', database], { input: ddl });
  fs.chmodSync(database, 0o600);
  db = require('../utils/prisma');
  const jwt = require('jsonwebtoken');
  const tokens = {};
  for (const role of ['ADMIN', 'SALES', 'WAREHOUSE']) {
    const user = await db.user.create({ data: { username: `synthetic-blno-${role}`, password: 'test-only-unused-hash', name: `合成${role}`, role: dbRole(role) } });
    tokens[role] = jwt.sign({ userId: user.id }, process.env.JWT_SECRET);
  }
  const port = await db.port.create({ data: { name: '合成提单港口', code: 'QA-BL' } });
  const app = require('../app');
  server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const call = async (method, url, body, role = 'ADMIN', expected = 200) => {
    const requestId = `synthetic-blno-${++requestNumber}`;
    const response = await fetch(base + url, {
      method,
      headers: { authorization: `Bearer ${tokens[role]}`, 'Content-Type': 'application/json', 'x-request-id': requestId },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json();
    if (['POST', 'PUT', 'DELETE'].includes(method) && response.status >= 200 && response.status < 300) expectedAuditRequests.add(requestId);
    assert.equal(response.status, expected, `${role} ${method} ${url}: ${result.message || ''}`);
    return result.data;
  };

  // A99: /containers is gone; the order header (PUT /sales/:id) is the only blNo write path. Value is trimmed.
  const created = await db.salesContract.create({ data: { contractNo: 'EXP-SYN-BL-1', exchangeRate: 7, portId: port.id } });
  assert.equal((await call('PUT', `/sales/${created.id}`, { blNo: '  MAEU123456789  ' }, 'SALES')).blNo, 'MAEU123456789');
  for (const role of ['ADMIN', 'WAREHOUSE']) {
    const orders = (await call('GET', '/sales?page=1&pageSize=20', undefined, role)).items.find((row) => row.id === created.id);
    assert.equal(orders.blNo, 'MAEU123456789', `${role} sales list`);
    assert.equal((await call('GET', `/sales/${created.id}`, undefined, role)).blNo, 'MAEU123456789', `${role} sales detail`);
  }

  // An omitted blNo keeps the stored value, empty clears it; WAREHOUSE may set it (operational identifier).
  assert.equal((await call('PUT', `/sales/${created.id}`, { blNo: 'COSU987654321' }, 'WAREHOUSE')).blNo, 'COSU987654321');
  assert.equal((await call('PUT', `/sales/${created.id}`, { note: 'y' }, 'SALES')).blNo, 'COSU987654321');
  assert.equal((await call('PUT', `/sales/${created.id}`, { blNo: '   ' }, 'ADMIN')).blNo, null);

  // Bad values are rejected and nothing is stored.
  await call('PUT', `/sales/${created.id}`, { blNo: 'X'.repeat(51) }, 'ADMIN', 400);
  await call('PUT', `/sales/${created.id}`, { blNo: 12345 }, 'ADMIN', 400);
  await call('PUT', `/sales/${created.id}`, { blNo: 'A\nB' }, 'SALES', 400);
  assert.equal((await db.salesContract.findUnique({ where: { id: created.id } })).blNo, null);
});
