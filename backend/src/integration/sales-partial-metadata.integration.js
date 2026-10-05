/** Real HTTP/SQLite partial sales-header edits; private synthetic data, unchanged roles/cargo boundaries. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('HTTP/SQLite: partial sales metadata preserves omitted fields and rejects invalid rates atomically', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-sales-partial-metadata-'));
  fs.chmodSync(directory, 0o700);
  const dbFile = path.join(directory, 'synthetic.db');
  process.env.DATABASE_URL = `file:${dbFile}`;
  process.env.UPLOAD_DIR = path.join(directory, 'uploads');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-only-sales-partial-secret-never-production';
  let db, server;
  t.after(async () => {
    if (server) {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
    if (db) await db.$disconnect();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const ddl = execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', path.resolve(__dirname, '../../prisma/schema.prisma'), '--script'], { encoding: 'utf8', timeout: 30000 });
  execFileSync('python3', ['-c', 'import sqlite3,sys,os; os.umask(0o077); c=sqlite3.connect(sys.argv[1]); c.executescript(sys.stdin.read()); c.close()', dbFile], { input: ddl });
  fs.chmodSync(dbFile, 0o600);
  assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
  assert.equal(fs.statSync(dbFile).mode & 0o777, 0o600);
  db = require('../utils/prisma');
  const jwt = require('jsonwebtoken');
  const config = require('../config');
  const users = {};
  for (const role of ['ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE', 'BOSS', 'INACTIVE']) {
    const user = await db.user.create({ data: { username: `synthetic-partial-${role}`, password: 'test-only-unused-hash', name: `Synthetic ${role}`, role: role === 'INACTIVE' ? 'SALES' : role, isActive: role !== 'INACTIVE' } });
    // Authentication must read the actual database role, not trust this claim.
    users[role] = jwt.sign({ userId: user.id, role: 'ADMIN' }, config.jwt.secret);
  }
  const port = await db.port.create({ data: { name: 'Synthetic original port', code: 'PARTIAL-A' } });
  const nextPort = await db.port.create({ data: { name: 'Synthetic edited port', code: 'PARTIAL-B' } });
  const product = await db.product.create({ data: { customsName: 'SYNTHETIC PARTIAL METADATA WIDGET', unit: '件' } });
  const createSale = (status = 'PACKING') => db.salesContract.create({ data: {
    contractNo: `EXP-SYNTHETIC-PARTIAL-${status}`, status, exchangeRate: 7.2, portId: port.id,
    signedAt: new Date('2026-10-01T00:00:00Z'), estimatedArrival: new Date('2026-11-01T00:00:00Z'),
    totalAmount: 100, receivedAmount: status === 'COMPLETED' ? 100 : 0,
    shippedAt: ['SHIPPED', 'COMPLETED'].includes(status) ? new Date('2026-10-02T00:00:00Z') : null,
  } });
  const sale = await createSale();
  const app = require('../app'); // Imported app does not start jobs or provider calls.
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const call = async (method, url, body, { role = 'SALES', expected = 200 } = {}) => {
    const response = await fetch(base + url, { method, headers: { ...(role ? { authorization: `Bearer ${users[role]}` } : {}), 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const result = await response.json();
    assert.equal(response.status, expected, `${method} ${url}: ${result.message || ''}`);
    return result.data;
  };
  // Separate read-only SQLite connection verifies persisted rows rather than API echoes.
  const snapshot = () => JSON.parse(execFileSync('python3', ['-c', `import sqlite3,sys,json
c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True)
c.row_factory=sqlite3.Row
tables=['sales_contracts','sales_items','packing_items','inventories','payments']
print(json.dumps({table:[dict(row) for row in c.execute('SELECT * FROM '+table+' ORDER BY id')] for table in tables}))
c.close()`, dbFile], { encoding: 'utf8', timeout: 10000 }));
  const header = () => snapshot().sales_contracts.find(row => row.id === sale.id);
  const withoutUpdatedAt = row => { const { updatedAt, ...fields } = row; return fields; };

  await t.test('note-only save persists without clearing exchange rate, dates, port or business totals', async () => {
    const before = header();
    const saved = await call('PUT', `/sales/${sale.id}`, { note: 'Synthetic note-only edit' });
    assert.equal(saved.exchangeRate, 7.2);
    assert.deepEqual(withoutUpdatedAt(header()), { ...withoutUpdatedAt(before), note: 'Synthetic note-only edit' });
  });

  await t.test('independent date/port edits, numeric rates and existing nullable semantics remain usable', async () => {
    for (const [body, field, value] of [
      [{ signedAt: '2026-10-03T00:00:00.000Z' }, 'signedAt', '2026-10-03T00:00:00.000Z'],
      [{ estimatedArrival: '2026-11-03T00:00:00.000Z' }, 'estimatedArrival', '2026-11-03T00:00:00.000Z'],
      [{ portId: nextPort.id }, 'portId', nextPort.id],
      [{ exchangeRate: ' 6.9 ' }, 'exchangeRate', 6.9],
      [{ exchangeRate: 7.3 }, 'exchangeRate', 7.3],
      [{ note: null }, 'note', null],
      [{ note: '' }, 'note', ''],
    ]) {
      const before = header();
      const saved = await call('PUT', `/sales/${sale.id}`, body);
      assert.equal(saved[field], value);
      const after = header();
      assert.equal(after[field], field.endsWith('At') || field === 'estimatedArrival' ? Date.parse(value) : value);
      assert.deepEqual(withoutUpdatedAt(after), { ...withoutUpdatedAt(before), [field]: after[field] });
    }
    // This endpoint already treats null/empty dates and ports as no-ops; note is nullable.
    for (const body of [{}, { signedAt: null, estimatedArrival: null, portId: null }, { signedAt: '', estimatedArrival: '', portId: '' }]) {
      const before = header();
      await call('PUT', `/sales/${sale.id}`, body);
      assert.deepEqual(withoutUpdatedAt(header()), withoutUpdatedAt(before));
    }
  });

  await t.test('explicit missing/invalid rates return 400 without partially saving accompanying notes', async () => {
    for (const exchangeRate of [null, '', ' ', 'not-a-rate', 'Infinity', 0, -7.2, true, false, [], [7.2], {}]) {
      const before = snapshot();
      await call('PUT', `/sales/${sale.id}`, { exchangeRate, note: 'Synthetic note must not save' }, { expected: 400 });
      assert.deepEqual(snapshot(), before);
    }
  });

  await t.test('existing writer roles remain allowed; BOSS, inactive and unauthenticated writes remain denied', async () => {
    for (const role of ['ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE']) {
      await call('PUT', `/sales/${sale.id}`, { note: `Synthetic ${role} edit` }, { role });
      assert.equal(header().note, `Synthetic ${role} edit`);
      assert.equal(header().exchangeRate, 7.3);
    }
    for (const [role, expected] of [['BOSS', 403], ['INACTIVE', 401], [null, 401]]) {
      const before = snapshot();
      await call('PUT', `/sales/${sale.id}`, { note: 'Synthetic denied edit' }, { role, expected });
      assert.deepEqual(snapshot(), before);
    }
    assert.equal((await call('GET', `/sales/${sale.id}`, undefined, { role: 'BOSS' })).id, sale.id);
  });

  await t.test('shipped/completed metadata edits preserve cargo, outbound evidence, status and settled amounts', async () => {
    for (const status of ['SHIPPED', 'COMPLETED']) {
      const locked = await createSale(status);
      const packing = await db.packingItem.create({ data: { salesContractId: locked.id, productId: product.id, quantity: 5, unit: '件', boxes: 1 } });
      await db.inventory.create({ data: { productId: product.id, salesContractId: locked.id, quantity: 5, unit: '件', status: 'OUTBOUND', outboundAt: locked.shippedAt } });
      const before = snapshot();
      await call('PUT', `/sales/${locked.id}`, { note: `Synthetic ${status} metadata` });
      const after = snapshot();
      assert.deepEqual(after.sales_contracts.map(withoutUpdatedAt), before.sales_contracts.map(row => ({ ...withoutUpdatedAt(row), ...(row.id === locked.id ? { note: `Synthetic ${status} metadata` } : {}) })));
      for (const table of ['sales_items', 'packing_items', 'inventories', 'payments']) assert.deepEqual(after[table], before[table]);
      for (const [method, url, body] of [
        ['PUT', `/sales/${locked.id}/packing-items/${packing.id}`, { quantity: 6 }],
        ['PUT', `/sales/${locked.id}/packing-items/${packing.id}`, { unit: '箱' }],
        ['DELETE', `/sales/${locked.id}/packing-items/${packing.id}`, undefined],
        ['DELETE', `/sales/${locked.id}`, undefined],
      ]) {
        await call(method, url, body, { expected: 400 });
        assert.deepEqual(snapshot(), after);
      }
    }
  });
});
