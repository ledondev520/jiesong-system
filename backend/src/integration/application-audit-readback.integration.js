/**
 * Input: actual application-audit HTTP routes, committed migrations and private synthetic SQLite
 * Output: filtered full-record/CSV readback, date/paging semantics and current role acceptance
 * Pos: ordinary system logs regression; no OS logs, real history, providers or production data
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const Papa = require('papaparse');

const ROLES = ['ADMIN', 'FINANCE', 'BOSS', 'SALES', 'PURCHASE', 'WAREHOUSE'];
const HEADERS = ['ID', '时间', '用户ID', '用户名', '姓名', '动作', '实体', '实体ID', 'IP地址', 'UserAgent', '修改前', '修改后'];
const OLD_VALUE = '{"name":"原始, \\\"中文\\\"","note":"第一行\\n第二行","quantity":2}';
const NEW_VALUE = '{"name":"修改, \\\"中文\\\"","note":"第三行\\n第四行","quantity":3}';
const DAY = Date.parse('2026-10-02T00:00:00.000Z');

test('HTTP/SQLite: application audit query and CSV preserve literal records and current roles', async t => {
  // 0. Every dependency sees only this new private, committed-migration database.
  const keys = ['DATABASE_URL', 'UPLOAD_DIR', 'NODE_ENV', 'JWT_SECRET', 'TZ'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const previousUmask = process.umask(0o077);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-application-audit-'));
  fs.chmodSync(directory, 0o700);
  const database = path.join(directory, 'synthetic.db');
  process.env.DATABASE_URL = `file:${database}`;
  process.env.UPLOAD_DIR = path.join(directory, 'uploads');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-only-application-audit-never-for-production';
  process.env.TZ = 'UTC';
  let db, server;
  t.after(async () => {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    if (db) await db.$disconnect();
    fs.rmSync(directory, { recursive: true, force: true });
    process.umask(previousUmask);
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });
  const migrations = path.resolve(__dirname, '../../prisma/migrations');
  const ddl = fs.readdirSync(migrations).sort()
    .filter(name => fs.statSync(path.join(migrations, name)).isDirectory())
    .map(name => fs.readFileSync(path.join(migrations, name, 'migration.sql'), 'utf8')).join('\n');
  execFileSync('python3', ['-c', 'import sqlite3,sys,os; os.umask(0o077); c=sqlite3.connect(sys.argv[1]); c.executescript(sys.stdin.read()); c.close()', database], { input: ddl, timeout: 10000 });
  fs.chmodSync(database, 0o600);

  /**
   * 职责：insert literal synthetic records without the controller being tested.
   * @param {object} tables table names mapped to literal rows
   * @returns {Buffer} subprocess output; throws on SQL failure
   */
  const seed = tables => execFileSync('python3', ['-c', `import sqlite3,sys,json
c=sqlite3.connect(sys.argv[1])
c.execute('PRAGMA foreign_keys=ON')
for table,rows in json.load(sys.stdin).items():
  for row in rows:
    keys=list(row)
    c.execute('INSERT INTO "'+table+'" ('+','.join('"'+key+'"' for key in keys)+') VALUES ('+','.join('?' for key in keys)+')',list(row.values()))
c.commit()
c.close()`, database], { input: JSON.stringify(tables), timeout: 10000 });

  /**
   * 职责：read complete application tables using a separate read-only SQLite connection.
   * @returns {object} full persisted snapshot; throws if unavailable
   */
  const snapshot = () => JSON.parse(execFileSync('python3', ['-c', `import sqlite3,sys,json
c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True)
c.row_factory=sqlite3.Row
tables=[r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
print(json.dumps({table:[dict(row) for row in c.execute('SELECT * FROM "'+table+'" ORDER BY rowid')] for table in tables}))
c.close()`, database], { encoding: 'utf8', timeout: 10000 }));

  const source = [
    { id: 'audit-before', userId: 'user-ADMIN', action: 'UPDATE', entity: 'Product', entityId: 'item-before', createdAt: DAY - 1 },
    { id: 'audit-start', userId: 'user-ADMIN', action: 'UPDATE', entity: 'Product', entityId: 'item-start', createdAt: DAY },
    { id: 'audit-middle', userId: 'user-ADMIN', action: 'UPDATE', entity: 'Product', entityId: 'item-middle', createdAt: DAY + 43200000, oldValue: OLD_VALUE, newValue: NEW_VALUE, ipAddress: 'Synthetic-IP-a', userAgent: 'Synthetic, "agent"\nline' },
    { id: 'audit-end', userId: 'user-ADMIN', action: 'UPDATE', entity: 'Product', entityId: 'item-end', createdAt: DAY + 86399999 },
    { id: 'audit-after', userId: 'user-ADMIN', action: 'UPDATE', entity: 'Product', entityId: 'item-after', createdAt: DAY + 86400000 },
    { id: 'audit-other-action', userId: 'user-ADMIN', action: 'CREATE', entity: 'Product', entityId: 'item-created', createdAt: DAY + 1000 },
    { id: 'audit-other-user', userId: 'user-SALES', action: 'UPDATE', entity: 'Product', entityId: 'item-sales', createdAt: DAY + 2000 },
    { id: 'audit-other-entity', userId: null, action: 'UPDATE', entity: 'Supplier', entityId: 'item-system', createdAt: DAY + 3000, newValue: 'synthetic plain text, "quoted"\nline' },
  ];
  seed({
    users: ROLES.map(role => ({ id: `user-${role}`, username: `synthetic-audit-${role}`, name: `Synthetic ${role}`, password: 'test-only-unused-hash', role, createdAt: DAY, updatedAt: DAY })),
    operation_logs: source,
  });
  db = require('../utils/prisma');
  const app = require('../app');
  server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const jwt = require('jsonwebtoken');
  const tokens = Object.fromEntries(ROLES.map(role => [role, jwt.sign({ userId: `user-${role}` }, process.env.JWT_SECRET)]));
  let sequence = 0;

  /**
   * 职责：exercise actual authenticated HTTP, returning unmodified JSON or CSV bytes.
   * @param {string} route actual route and query
   * @param {string|null} role synthetic role, or null for unauthenticated
   * @param {object} options optional method/body/request ID
   * @returns {Promise<object>} actual status, headers and response content
   */
  const call = async (route, role = 'ADMIN', options = {}) => {
    const response = await fetch(base + route, {
      method: options.method || 'GET',
      headers: { ...(role ? { authorization: `Bearer ${tokens[role]}` } : {}), 'content-type': 'application/json', 'x-request-id': options.requestId || `synthetic-audit-${++sequence}` },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    const csv = response.headers.get('content-type')?.startsWith('text/csv');
    return { status: response.status, headers: response.headers, bytes, body: csv ? null : JSON.parse(bytes.toString('utf8')) };
  };

  /**
   * 职责：read actual list results and verify success without calling a query builder.
   * @param {string} query URL query from literal expectations
   * @returns {Promise<object>} actual paginated result
   */
  const list = async (query = '') => {
    const response = await call(`/system/logs${query ? `?${query}` : ''}`);
    assert.equal(response.status, 200, 'application audit list must succeed');
    return response.body.data;
  };

  /**
   * 职责：parse downloaded bytes independently and verify existing CSV framing.
   * @param {string} query actual export query
   * @returns {Promise<string[][]>} complete textual CSV rows after headers
   */
  const csvRows = async (query = '') => {
    const result = await call(`/system/logs/export/csv${query ? `?${query}` : ''}`);
    assert.equal(result.status, 200, 'application audit CSV must succeed');
    assert.equal(result.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.match(result.headers.get('content-disposition'), /^attachment; filename="operation_logs_.*\.csv"$/);
    assert.deepEqual([...result.bytes.subarray(0, 3)], [239, 187, 191]);
    const parsed = Papa.parse(result.bytes.toString('utf8'), { skipEmptyLines: true });
    assert.deepEqual(parsed.errors, []);
    assert.deepEqual(parsed.data[0], HEADERS);
    for (const row of parsed.data) assert.equal(row.length, 12);
    return parsed.data.slice(1);
  };

  await t.test('keyword and IP searches round-trip the same matching records through list and export', async () => {
    const before = snapshot();
    for (const query of ['keyword=product', 'ipAddress=synthetic-ip-A']) {
      const statuses = await Promise.all(['/system/logs', '/system/logs/export/csv'].map(async route => (await call(`${route}?${query}`)).status));
      assert.deepEqual(statuses, [200, 200], `${query} must work through both actual read routes`);
    }
    const cases = [
      ['keyword=product', ['audit-after', 'audit-end', 'audit-middle', 'audit-other-user', 'audit-other-action', 'audit-start', 'audit-before']],
      ['keyword=update', ['audit-after', 'audit-end', 'audit-middle', 'audit-other-entity', 'audit-other-user', 'audit-start', 'audit-before']],
      ['keyword=item-middle', ['audit-middle']],
      ['keyword=原始', ['audit-middle']],
      ['keyword=修改', ['audit-middle']],
      ['keyword=synthetic-ip-A', ['audit-middle']],
      ['keyword=SYNTHETIC%20ADMIN', ['audit-after', 'audit-end', 'audit-middle', 'audit-other-action', 'audit-start', 'audit-before']],
      ['keyword=synthetic-audit-sales', ['audit-other-user']],
      ['ipAddress=synthetic-ip-A', ['audit-middle']],
      ['keyword=no-synthetic-match', []],
    ];
    for (const [query, ids] of cases) {
      assert.deepEqual((await list(query)).items.map(row => row.id), ids, query);
      assert.deepEqual((await csvRows(query)).map(row => row[0]), ids, query);
    }
    assert.deepEqual(snapshot(), before, 'audit query/export must not rewrite any application table');
  });

  await t.test('combined dates retain inclusive date-only ends, exact ISO instants and page-independent export', async () => {
    const before = snapshot();
    const query = 'userId=user-ADMIN&entity=Product&action=UPDATE&startDate=2026-10-02&endDate=2026-10-02';
    const first = await list(`${query}&page=1&pageSize=2`);
    assert.deepEqual(first.items.map(row => row.id), ['audit-end', 'audit-middle']);
    assert.deepEqual(first.pagination, { page: 1, pageSize: 2, total: 3, totalPages: 2 });
    assert.deepEqual((await list(`${query}&page=2&pageSize=2`)).items.map(row => row.id), ['audit-start']);
    assert.deepEqual((await csvRows(`${query}&page=2&pageSize=2`)).map(row => row[0]), ['audit-end', 'audit-middle', 'audit-start']);
    assert.deepEqual((await csvRows(`${query}&limit=1`)).map(row => row[0]), ['audit-end']);
    assert.deepEqual((await list('userId=user-ADMIN&entity=Product&action=UPDATE&startDate=2026-10-02&endDate=2026-10-02T12%3A00%3A00.000Z')).items.map(row => row.id), ['audit-middle', 'audit-start']);
    assert.deepEqual((await list('entityId=item-after')).items.map(row => row.id), ['audit-after']);
    for (const invalid of ['startDate=synthetic-invalid', 'endDate=synthetic-invalid', 'startDate=2026-10-03&endDate=2026-10-02']) {
      assert.equal((await call(`/system/logs?${invalid}`)).status, 400);
      assert.equal((await call(`/system/logs/export/csv?${invalid}`)).status, 400);
    }
    assert.deepEqual(snapshot(), before, 'paging, empty results and rejected queries are read-only');
  });

  await t.test('full record content and CSV retain old/new snapshots, null actor, Unicode, quotes and multiline text', async () => {
    const before = snapshot();
    const detail = (await list('entity=Product&entityId=item-middle&action=UPDATE')).items;
    assert.equal(detail.length, 1);
    const row = detail[0];
    assert.equal(row.id, 'audit-middle');
    assert.equal(row.createdAt, '2026-10-02T12:00:00.000Z');
    assert.equal(row.oldValue, OLD_VALUE);
    assert.equal(row.newValue, NEW_VALUE);
    assert.deepEqual(row.user, { id: 'user-ADMIN', name: 'Synthetic ADMIN', username: 'synthetic-audit-ADMIN' });
    assert.deepEqual(await csvRows('entityId=item-middle'), [[
      'audit-middle', '2026-10-02T12:00:00.000Z', 'user-ADMIN', 'synthetic-audit-ADMIN', 'Synthetic ADMIN', 'UPDATE', 'Product', 'item-middle', 'Synthetic-IP-a', 'Synthetic, "agent"\nline', OLD_VALUE, NEW_VALUE,
    ]]);
    const system = (await list('entityId=item-system')).items[0];
    assert.equal(system.user, null);
    assert.equal(system.userId, null);
    assert.equal(system.oldValue, null);
    assert.deepEqual(await csvRows('entityId=item-system'), [[
      'audit-other-entity', '2026-10-02T00:00:03.000Z', '', '', '', 'UPDATE', 'Supplier', 'item-system', '', '', '', 'synthetic plain text, "quoted"\nline',
    ]]);
    assert.deepEqual(snapshot(), before, 'complete record/content reads preserve all stored facts');
  });

  await t.test('ADMIN alone can query/export and every current business role is denied without changes', async () => {
    const before = snapshot();
    for (const role of [...ROLES.slice(1), null]) {
      const status = role ? 403 : 401;
      assert.equal((await call('/system/logs', role)).status, status, String(role));
      assert.equal((await call('/system/logs/export/csv', role)).status, status, String(role));
    }
    assert.deepEqual(snapshot(), before, 'denied reads must not change application state');
  });

  await t.test('an actual synthetic category audit reads back its actor and repeated reads add no business mutations', async () => {
    const requestId = 'synthetic-audit-generated-category';
    const created = await call('/system/categories', 'ADMIN', { method: 'POST', body: { name: 'Synthetic audit category' }, requestId });
    assert.equal(created.status, 200);
    const categoryId = created.body.data.id;
    let generated;
    const deadline = performance.now() + 5000;
    while (!generated) {
      generated = snapshot().operation_logs.find(row => row.requestId === requestId);
      if (generated) break;
      assert.ok(performance.now() < deadline, 'actual application audit must settle');
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    const before = snapshot();
    assert.equal(generated.userId, 'user-ADMIN');
    assert.equal(generated.action, 'CREATE');
    assert.equal(generated.entity, 'ProductCategory');
    assert.equal(generated.entityId, categoryId);
    assert.equal(JSON.parse(generated.newValue).name, 'Synthetic audit category');
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const rows = (await list(`entity=ProductCategory&entityId=${categoryId}`)).items;
      assert.equal(rows.length, 1);
      assert.equal(rows[0].id, generated.id);
      assert.equal(rows[0].newValue, generated.newValue);
      const exported = await csvRows(`entity=ProductCategory&entityId=${categoryId}`);
      assert.equal(exported.length, 1);
      assert.equal(exported[0][2], 'user-ADMIN');
      assert.equal(exported[0][11], generated.newValue);
    }
    assert.deepEqual(snapshot(), before, 'these existing audit read routes do not create read-audit or business rows');
    assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
    assert.equal(fs.statSync(database).mode & 0o777, 0o600);
  });

  await t.test('intentional DataExport read auditing remains distinct from unchanged business rows', async () => {
    const before = snapshot();
    const requestId = 'synthetic-audit-read-export';
    const result = await call('/system/export/products', 'ADMIN', { requestId });
    assert.equal(result.status, 200);
    assert.deepEqual(Papa.parse(result.bytes.toString('utf8'), { skipEmptyLines: true }).data, [['ID', '报关名', '描述', '规格', '单位', '分类']]);
    let audit;
    const deadline = performance.now() + 5000;
    while (!audit) {
      audit = snapshot().operation_logs.find(row => row.requestId === requestId);
      if (audit) break;
      assert.ok(performance.now() < deadline, 'intentional export read audit must settle');
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    const after = snapshot();
    const { operation_logs: beforeAudit, ...beforeBusiness } = before;
    const { operation_logs: afterAudit, ...afterBusiness } = after;
    assert.deepEqual(afterBusiness, beforeBusiness, 'read audit must not rewrite any business or user field');
    assert.equal(afterAudit.length, beforeAudit.length + 1);
    assert.equal(audit.userId, 'user-ADMIN');
    assert.equal(audit.action, 'EXPORT');
    assert.equal(audit.entity, 'DataExport');
    assert.deepEqual(JSON.parse(audit.newValue), { type: 'products', format: 'csv', query: {} });
    const rows = (await list('entity=DataExport&action=EXPORT')).items;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, audit.id);
    const exported = await csvRows('entity=DataExport&action=EXPORT');
    assert.equal(exported[0][11], audit.newValue);
    assert.deepEqual(snapshot(), after, 'audit readback preserves the intentional export metadata');
  });
});
