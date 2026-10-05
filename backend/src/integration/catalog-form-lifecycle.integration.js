/**
 * Input: actual catalogue HTTP routes and migrated private synthetic SQLite
 * Output: three create/edit/readback and failed-edit persistence cases
 * Pos: ordinary settings regression; no production data or permission tests
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('HTTP/SQLite: catalogue forms preserve valid and rejected edits', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-catalog-forms-'));
  fs.chmodSync(directory, 0o700);
  const database = path.join(directory, 'synthetic.db');
  process.env.DATABASE_URL = `file:${database}`;
  process.env.UPLOAD_DIR = path.join(directory, 'uploads');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-only-catalogue-fixture-never-for-production';
  process.env.TZ = 'UTC';
  const originalUmask = process.umask(0o022);
  let db, server;
  let sequence = 0;
  const auditRequests = new Set();
  t.after(async () => {
    if (server) {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
    // Successful response-finish audit writes must finish before deleting this fixture.
    if (db && auditRequests.size) {
      const deadline = Date.now() + 5000;
      while (true) {
        const saved = await db.operationLog.findMany({
          where: { requestId: { in: [...auditRequests] } },
          select: { requestId: true },
        });
        const persisted = new Set(saved.map(row => row.requestId));
        if ([...auditRequests].every(id => persisted.has(id))) break;
        assert.ok(Date.now() < deadline, 'catalogue fixture audit writes did not settle');
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    if (db) await db.$disconnect();
    fs.rmSync(directory, { recursive: true, force: true });
    process.umask(originalUmask);
  });
  // Apply the committed migrations; never use db push or regenerate shared clients.
  const migrations = path.resolve(__dirname, '../../prisma/migrations');
  const ddl = fs.readdirSync(migrations).sort()
    .filter(name => fs.statSync(path.join(migrations, name)).isDirectory())
    .map(name => fs.readFileSync(path.join(migrations, name, 'migration.sql'), 'utf8')).join('\n');
  execFileSync('python3', ['-c', 'import sqlite3,sys,os; os.umask(0o077); c=sqlite3.connect(sys.argv[1]); c.executescript(sys.stdin.read()); c.close()', database], { input: ddl });
  fs.chmodSync(database, 0o600);
  assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
  assert.equal(fs.statSync(database).mode & 0o777, 0o600);
  db = require('../utils/prisma');
  const user = await db.user.create({ data: {
    username: 'synthetic-catalogue-editor', name: 'Synthetic catalogue editor',
    password: 'test-only-unused-hash', role: 'ADMIN',
  } });
  const token = require('jsonwebtoken').sign({ userId: user.id }, process.env.JWT_SECRET);
  const app = require('../app');
  server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const base = `http://127.0.0.1:${server.address().port}/api/v1/system`;
  const call = async (method, route, body) => {
    const requestId = `synthetic-catalogue-${++sequence}`;
    const response = await fetch(base + route, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'x-request-id': requestId },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = await response.json();
    if (method !== 'GET' && response.status >= 200 && response.status < 300) auditRequests.add(requestId);
    return { status: response.status, ...payload };
  };
  const good = async (...args) => {
    const result = await call(...args);
    assert.equal(result.status, 200, `${args[0]} ${args[1]}: ${result.message}`);
    return result.data;
  };
  const listed = async (route, id) => {
    const data = await good('GET', route);
    const row = data.items.find(item => item.id === id);
    assert.ok(row, `${route} must read back the saved catalogue row`);
    return row;
  };
  // A separate read-only SQLite connection proves failed saves did not change rows.
  const snapshot = table => JSON.parse(execFileSync('python3', ['-c',
    "import sqlite3,sys,json; c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True); c.row_factory=sqlite3.Row; print(json.dumps([dict(row) for row in c.execute('SELECT * FROM '+sys.argv[2]+' ORDER BY id')])); c.close()",
    database, table], { encoding: 'utf8', timeout: 10000 }));

  await t.test('ports normalize valid edits and reject blank/duplicate fields atomically', async () => {
    const created = await good('POST', '/ports', { name: ' Synthetic port ', code: ' syn-one ' });
    assert.equal(created.name, 'Synthetic port');
    assert.equal(created.code, 'SYN-ONE');
    await good('PUT', `/ports/${created.id}`, { name: ' Synthetic revised port ', code: ' syn-two ' });
    let saved = await listed('/ports', created.id);
    assert.equal(saved.name, 'Synthetic revised port');
    assert.equal(saved.code, 'SYN-TWO');
    assert.equal(saved.isActive, true);
    const occupied = await good('POST', '/ports', { name: 'Synthetic occupied port', code: 'SYN-TAKEN' });
    const failures = [];
    for (const body of [{ name: '   ', code: 'SYN-INVALID' }, { name: 'Synthetic invalid port', code: '   ' }]) {
      const before = snapshot('ports');
      const result = await call('POST', '/ports', body);
      const unchanged = JSON.stringify(snapshot('ports')) === JSON.stringify(before);
      if (result.status !== 400 || !unchanged) failures.push({ body, status: result.status, unchanged });
    }
    for (const body of [
      { name: '   ', code: 'SYN-CHANGED' },
      { name: 'Synthetic unwanted change', code: '   ' },
      { name: null, code: 'SYN-CHANGED' },
      { name: 'Synthetic unwanted change', code: null },
      { name: 'Synthetic unwanted change', code: occupied.code },
      { name: occupied.name, code: 'SYN-CHANGED' },
    ]) {
      const before = snapshot('ports');
      const result = await call('PUT', `/ports/${created.id}`, body);
      const unchanged = JSON.stringify(snapshot('ports')) === JSON.stringify(before);
      if (result.status !== 400 || !unchanged) failures.push({ body, status: result.status, unchanged });
    }
    assert.deepEqual(failures, [], 'rejected port saves must retain all fields and timestamps');
    saved = await listed('/ports', created.id);
    assert.equal(saved.name, 'Synthetic revised port');
    assert.equal(saved.code, 'SYN-TWO');
  });

  await t.test('categories preserve parent links through valid edits and rejected saves', async () => {
    const parent = await good('POST', '/categories', { name: 'Synthetic parent category' });
    const created = await good('POST', '/categories', { name: ' Synthetic category ', parentId: parent.id });
    assert.equal(created.name, 'Synthetic category');
    assert.equal(created.parent.id, parent.id);
    await good('PUT', `/categories/${created.id}`, { name: ' Synthetic revised category ' });
    let saved = await listed('/categories', created.id);
    assert.equal(saved.name, 'Synthetic revised category');
    assert.equal(saved.parentId, parent.id);
    assert.equal(saved.parent.id, parent.id);
    const failures = [];
    const beforeCreate = snapshot('product_categories');
    const invalidCreate = await call('POST', '/categories', { name: '   ', parentId: parent.id });
    const createUnchanged = JSON.stringify(snapshot('product_categories')) === JSON.stringify(beforeCreate);
    if (invalidCreate.status !== 400 || !createUnchanged) failures.push({ status: invalidCreate.status, unchanged: createUnchanged });
    for (const body of [
      { name: '   ', parentId: null },
      { name: null, parentId: null },
      { name: 'Synthetic unwanted category', parentId: 'missing-synthetic-parent' },
      { name: parent.name, parentId: null },
    ]) {
      const before = snapshot('product_categories');
      const result = await call('PUT', `/categories/${created.id}`, body);
      const expectedFailure = body.name === parent.name ? result.status >= 400 : result.status === 400;
      const unchanged = JSON.stringify(snapshot('product_categories')) === JSON.stringify(before);
      if (!expectedFailure || !unchanged) failures.push({ body, status: result.status, unchanged });
    }
    assert.deepEqual(failures, [], 'failed category saves must retain the prior name, parent and timestamps');
    await good('PUT', `/categories/${created.id}`, { parentId: '' });
    saved = await listed('/categories', created.id);
    assert.equal(saved.name, 'Synthetic revised category');
    assert.equal(saved.parentId, null);
    assert.equal(saved.parent, null);
  });

  await t.test('broker optional fields clear with the form null payload and invalid names preserve the record', async () => {
    const fields = { contact: ' Synthetic contact ', phone: ' synthetic-phone ', email: ' broker@example.invalid ', address: ' Synthetic address ' };
    const created = await good('POST', '/customs-brokers', { name: ' Synthetic broker ', ...fields });
    assert.equal(created.name, 'Synthetic broker');
    for (const [field, value] of Object.entries(fields)) assert.equal(created[field], value.trim());
    await good('PUT', `/customs-brokers/${created.id}`, { name: ' Synthetic revised broker ' });
    const saved = await listed('/customs-brokers', created.id);
    assert.equal(saved.name, 'Synthetic revised broker');
    for (const [field, value] of Object.entries(fields)) assert.equal(saved[field], value.trim(), 'omitted optional fields retain saved values');
    // The existing broker form sends null for every deliberately emptied field.
    const cleared = await good('PUT', `/customs-brokers/${created.id}`, { contact: null, phone: null, email: null, address: null });
    const failures = [];
    for (const field of Object.keys(fields)) if (cleared[field] !== null) failures.push({ field, saved: cleared[field] });
    for (const name of ['   ', null]) {
      const before = snapshot('customs_brokers');
      const rejected = await call('PUT', `/customs-brokers/${created.id}`, { name, contact: 'Synthetic unwanted contact' });
      const unchanged = JSON.stringify(snapshot('customs_brokers')) === JSON.stringify(before);
      if (rejected.status !== 400 || !unchanged) failures.push({ name, status: rejected.status, unchanged });
    }
    assert.deepEqual(failures, [], 'broker clearing must persist null and a failed edit must retain all saved fields');
    const readback = await listed('/customs-brokers', created.id);
    assert.equal(readback.name, 'Synthetic revised broker');
    for (const field of Object.keys(fields)) assert.equal(readback[field], null);
  });
});
