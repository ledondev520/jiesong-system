/**
 * Input: active multipart purchase import, generated workbooks and committed migrations
 * Output: six HTTP/SQLite workbook validation, value-preservation and replay cases
 * Pos: private synthetic Excel-import regression; no browser, providers or real records
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('HTTP/SQLite: active purchase Excel import preserves rows and rejects invalid supplied values', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-purchase-excel-'));
  fs.chmodSync(directory, 0o700);
  const database = path.join(directory, 'synthetic.db');
  process.env.DATABASE_URL = `file:${database}`;
  process.env.UPLOAD_DIR = path.join(directory, 'uploads');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-only-purchase-excel-secret-never-for-production';
  process.env.TZ = 'UTC';
  fs.mkdirSync(process.env.UPLOAD_DIR, { mode: 0o700 });
  let db, server;
  t.after(async () => {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    if (db) await db.$disconnect();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  // Build only this private database from committed SQL; never db push or
  // regenerate a shared Prisma client. Workbook bytes remain synthetic.
  const migrations = path.resolve(__dirname, '../../prisma/migrations');
  const ddl = fs.readdirSync(migrations).sort()
    .filter(name => fs.statSync(path.join(migrations, name)).isDirectory())
    .map(name => fs.readFileSync(path.join(migrations, name, 'migration.sql'), 'utf8')).join('\n');
  execFileSync('python3', ['-c', 'import sqlite3,sys,os; os.umask(0o077); c=sqlite3.connect(sys.argv[1]); c.executescript(sys.stdin.read()); c.close()', database], { input: ddl, timeout: 30000 });
  fs.chmodSync(database, 0o600);
  assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
  assert.equal(fs.statSync(database).mode & 0o777, 0o600);
  db = require('../utils/prisma');
  const jwt = require('jsonwebtoken');
  const tokens = {};
  for (const role of ['ADMIN', 'PURCHASE']) {
    const user = await db.user.create({ data: { username: `synthetic-excel-${role}`, password: 'test-only-unused-hash', name: `Synthetic ${role}`, role } });
    tokens[role] = jwt.sign({ userId: user.id }, process.env.JWT_SECRET);
  }
  const supplier = await db.supplier.create({ data: { name: '合成 Excel 供应商', taxId: 'SYNTHETIC-EXCEL-TAX-ID' } });
  const existing = await db.purchaseContract.create({ data: { contractNo: 'SYNTHETIC-EXISTING', supplierId: supplier.id, totalAmount: 87.65, signedAt: new Date('2026-09-15T00:00:00Z'), note: '合成既有记录' } });
  const app = require('../app');
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const xlsx = require('xlsx');
  // Same column shape as the active page's purchase export. It is a header
  // import, not the separate JSON product-line import or an invented template.
  const headers = ['合同编号', '供应商名称', '签订日期', '总金额', '币种', '状态', '备注'];
  const row = (contractNo, values = {}) => [contractNo, supplier.name, '2026-10-01', 1234.5, 'CNY', '草稿', '合成备注'].map((value, index) => Object.hasOwn(values, headers[index]) ? values[headers[index]] : value);
  const upload = (rows, { columns = headers, historical = false } = {}) => {
    const book = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(book, xlsx.utils.aoa_to_sheet([columns, ...rows]), '合成采购合同');
    const form = new FormData();
    if (historical) form.append('historical', 'true');
    form.append('file', new Blob([xlsx.write(book, { type: 'buffer', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'synthetic-purchase.xlsx');
    return form;
  };
  const call = async (body, { role = 'PURCHASE', expected = 200 } = {}) => {
    const response = await fetch(`${base}/purchases/import`, { method: 'POST', headers: { authorization: `Bearer ${tokens[role]}` }, body });
    const result = await response.json();
    assert.equal(response.status, expected, result.message);
    return result.data;
  };
  // Independently read every stored value and timestamp, including related
  // source tables, instead of trusting only the import response or ORM cache.
  const snapshot = () => JSON.parse(execFileSync('python3', ['-c', `import sqlite3,sys,json
c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True)
c.row_factory=sqlite3.Row
tables=['purchase_contracts','purchase_items','suppliers','products','inventories','purchase_receipts','purchase_receipt_items','purchase_receipt_inspections','payments']
print(json.dumps({table:[dict(row) for row in c.execute('SELECT * FROM '+table+' ORDER BY id')] for table in tables}))
c.close()`, database], { encoding: 'utf8', timeout: 10000 }));
  const unaffected = () => Object.fromEntries(Object.entries(snapshot()).filter(([table]) => table !== 'purchase_contracts'));
  const originalRelated = unaffected();

  await t.test('valid workbook preserves numeric, decimal-text, Excel-date and text semantics', async () => {
    const result = await call(upload([
      row('000001', { '签订日期': new Date('2026-10-02T00:00:00Z'), '总金额': 0, '备注': '  合成备注  内侧空格  ' }),
      row('SYNTHETIC-DECIMAL', { '签订日期': '2026/10/03', '总金额': '1,234.50', '状态': '生产中' }),
      row('SYNTHETIC-OPTIONAL-BLANK', { '签订日期': '', '总金额': '', '状态': '', '备注': '' }),
    ]));
    assert.deepEqual(result, { successRows: 3, failedRows: 0, errors: [] });
    const contracts = snapshot().purchase_contracts;
    for (const [contractNo, amount, date, status, note] of [
      ['000001', 0, Date.parse('2026-10-02T00:00:00Z'), 'DRAFT', '合成备注  内侧空格'],
      ['SYNTHETIC-DECIMAL', 1234.5, Date.parse('2026-10-03T00:00:00Z'), 'PRODUCING', '合成备注'],
      ['SYNTHETIC-OPTIONAL-BLANK', 0, null, 'DRAFT', null],
    ]) {
      const contract = contracts.find(record => record.contractNo === contractNo);
      assert.ok(contract);
      assert.equal(contract.totalAmount, amount);
      assert.equal(contract.signedAt, date);
      assert.equal(contract.status, status);
      assert.equal(contract.note, note);
      assert.equal(contract.supplierId, supplier.id);
    }
    assert.deepEqual(unaffected(), originalRelated, 'summary import must not create lines, stock, receipts, inspections or payments');
    assert.deepEqual(await db.purchaseContract.findUnique({ where: { id: existing.id } }), existing);
  });

  await t.test('missing supplier header, empty workbook and missing file fail without business writes', async () => {
    const before = snapshot();
    await call(upload([['SYNTHETIC-NO-SUPPLIER']], { columns: ['合同编号'] }), { expected: 400 });
    await call(upload([]), { expected: 400 });
    await call(new FormData(), { expected: 400 });
    assert.deepEqual(snapshot(), before);
  });

  await t.test('missing or unknown supplier and invalid status fail individually while later rows commit', async () => {
    const before = snapshot();
    const result = await call(upload([
      row('SYNTHETIC-MIXED-BEFORE'),
      row('SYNTHETIC-NO-NAME', { '供应商名称': '' }),
      row('SYNTHETIC-UNKNOWN', { '供应商名称': '合成不存在的供应商' }),
      row('SYNTHETIC-BAD-STATUS', { '状态': '合成非法状态' }),
      row('SYNTHETIC-MIXED-AFTER'),
    ]));
    assert.equal(result.successRows, 2);
    assert.equal(result.failedRows, 3);
    assert.deepEqual(result.errors.map(error => error.row), [3, 4, 5]);
    assert.equal(snapshot().purchase_contracts.length, before.purchase_contracts.length + 2);
    assert.deepEqual(unaffected(), originalRelated);
  });

  await t.test('supplied malformed amount or impossible date is rejected, never silently replaced or normalized', async () => {
    const before = snapshot();
    const invalid = [
      { '总金额': 'invalid-synthetic-amount' },
      { '总金额': 'Infinity' },
      { '总金额': true },
      { '总金额': -1 },
      { '签订日期': 'invalid-synthetic-date' },
      { '签订日期': '2026-02-30' },
      { '签订日期': '2026-13-01' },
      { '签订日期': true },
      { '签订日期': -1 },
    ];
    const result = await call(upload(invalid.map((values, index) => row(`SYNTHETIC-INVALID-${index}`, values))));
    assert.equal(result.successRows, 0, 'invalid provided values must not import as zero, null or a different date');
    assert.equal(result.failedRows, invalid.length);
    assert.deepEqual(result.errors.map(error => error.row), invalid.map((_, index) => index + 2));
    assert.deepEqual(snapshot(), before);
    const mixed = await call(upload([
      row('SYNTHETIC-INVALID-BOUNDARY-BEFORE'),
      ...invalid.map((values, index) => row(`SYNTHETIC-INVALID-${index}`, values)),
      row('SYNTHETIC-INVALID-BOUNDARY-AFTER'),
    ]));
    assert.equal(mixed.successRows, 2);
    assert.equal(mixed.failedRows, invalid.length);
    assert.deepEqual(mixed.errors.map(error => error.row), invalid.map((_, index) => index + 3));
    const after = snapshot();
    assert.deepEqual(after.purchase_contracts.filter(record => before.purchase_contracts.some(previous => previous.id === record.id)), before.purchase_contracts);
    const created = after.purchase_contracts.filter(record => !before.purchase_contracts.some(previous => previous.id === record.id));
    assert.deepEqual(created.map(record => record.contractNo).sort(), ['SYNTHETIC-INVALID-BOUNDARY-AFTER', 'SYNTHETIC-INVALID-BOUNDARY-BEFORE']);
    assert.deepEqual(unaffected(), originalRelated);
  });

  await t.test('explicit-number replay fails unchanged; blank-number replay is another import, not an idempotency claim', async () => {
    const explicit = [row('SYNTHETIC-REPLAY')];
    assert.deepEqual(await call(upload(explicit)), { successRows: 1, failedRows: 0, errors: [] });
    const after = snapshot();
    const replay = await call(upload(explicit));
    assert.equal(replay.successRows, 0);
    assert.equal(replay.failedRows, 1);
    assert.equal(replay.errors[0].row, 2);
    assert.match(replay.errors[0].error, /已存在/);
    assert.deepEqual(snapshot(), after);
    for (let attempt = 0; attempt < 2; attempt++) {
      assert.deepEqual(await call(upload([row('')])), { successRows: 1, failedRows: 0, errors: [] });
    }
    const fresh = snapshot().purchase_contracts.filter(record => !after.purchase_contracts.some(previous => previous.id === record.id));
    assert.equal(fresh.length, 2);
    assert.equal(new Set(fresh.map(record => record.contractNo)).size, 2);
    assert.deepEqual(unaffected(), originalRelated);
  });

  await t.test('normal completed import fails; only explicit administrator historical import retains that status', async () => {
    const before = snapshot();
    const rows = [row('SYNTHETIC-HISTORY', { '状态': '已完成' })];
    const ordinary = await call(upload(rows));
    assert.equal(ordinary.successRows, 0);
    assert.equal(ordinary.failedRows, 1);
    await call(upload(rows, { historical: true }), { expected: 403 });
    assert.deepEqual(snapshot(), before);
    assert.deepEqual(await call(upload(rows, { historical: true }), { role: 'ADMIN' }), { successRows: 1, failedRows: 0, errors: [] });
    assert.equal(snapshot().purchase_contracts.find(record => record.contractNo === 'SYNTHETIC-HISTORY').status, 'COMPLETED');
    assert.deepEqual(unaffected(), originalRelated, 'history choice must not invent inventory or receipt evidence');
  });
});
