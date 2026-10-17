/** Synthetic HTTP/SQLite migration acceptance; never opens an existing database. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ExcelJS = require('exceljs');
const Papa = require('papaparse');

test('catalog imports: downloadable templates, read-only preview, atomic execution and replay protection', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-catalog-'));
  fs.chmodSync(dir, 0o700);
  const database = path.join(dir, 'synthetic.db');
  process.env.DATABASE_URL = `file:${database}`;
  const migrations = path.resolve(__dirname, '../../prisma/migrations');
  const ddl = fs.readdirSync(migrations).sort().filter(name => fs.statSync(path.join(migrations, name)).isDirectory())
    .map(name => fs.readFileSync(path.join(migrations, name, 'migration.sql'), 'utf8')).join('\n');
  execFileSync('python3', ['-c', 'import os,sqlite3,sys; os.umask(0o077); c=sqlite3.connect(sys.argv[1]); c.executescript(sys.stdin.read()); c.close()', database], { input: ddl });
  const db = require('../utils/prisma');
  const admin = await db.user.create({ data: { username: 'synthetic-import-admin', name: 'Synthetic', password: 'synthetic-unused-hash', role: 'ADMIN' } });
  const purchase = await db.user.create({ data: { username: 'synthetic-import-purchase', name: 'Synthetic', password: 'synthetic-unused-hash', role: 'PURCHASE' } });
  const jwt = require('jsonwebtoken');
  const tokens = Object.fromEntries([admin, purchase].map(user => [user.role, jwt.sign({ userId: user.id }, process.env.JWT_SECRET)]));
  const app = require('express')();
  app.use('/import', require('../routes/dataImport'));
  app.use(require('../middleware/errorHandler').errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await db.$disconnect(); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}/import`;
  const snapshot = () => execFileSync('python3', ['-c',
    'import sqlite3,json,sys; c=sqlite3.connect("file:"+sys.argv[1]+"?mode=ro",uri=True); tables=[r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type=\'table\' ORDER BY name")]; print(json.dumps({n:list(c.execute(\'SELECT * FROM "\'+n+\'" ORDER BY rowid\')) for n in tables},default=str)); c.close()', database], { encoding: 'utf8' });
  const request = async (url, options = {}, role = 'ADMIN') => {
    const response = await fetch(base + url, { ...options, headers: role ? { authorization: `Bearer ${tokens[role]}` } : {} });
    return { status: response.status, body: await response.json() };
  };
  const upload = async (kind, rows, action = 'preview', format = 'csv', confirm = false, role = 'ADMIN') => {
    const headers = templates.find(item => item.kind === kind).headers;
    let bytes;
    if (format === 'csv') bytes = Buffer.from(Papa.unparse({ fields: headers, data: rows }));
    else {
      const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet('data'); sheet.addRow(headers); rows.forEach(row => sheet.addRow(row));
      bytes = Buffer.from(await book.xlsx.writeBuffer());
    }
    const form = new FormData(); form.append('file', new Blob([bytes]), `synthetic.${format}`); if (confirm) form.append('confirmOpening', 'true');
    return request(`/catalog/${kind}/${action}`, { method: 'POST', body: form }, role);
  };
  const templates = (await request('/templates')).body.data;
  assert.equal(templates.length, 4);
  const evidence = process.env.JIESONG_TEST_EVIDENCE_DIR;
  if (evidence) fs.mkdirSync(evidence, { recursive: true, mode: 0o700 });

  await t.test('all eight downloads are real CSV/xlsx with expected headers and no database writes', async () => {
    const before = snapshot();
    for (const item of templates) for (const format of ['csv', 'xlsx']) {
      const response = await fetch(`${base}/templates/${item.kind}?format=${format}`, { headers: { authorization: `Bearer ${tokens.ADMIN}` } });
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-disposition'), new RegExp(`${item.kind}-template\\.${format}`));
      const bytes = Buffer.from(await response.arrayBuffer());
      if (evidence) fs.writeFileSync(path.join(evidence, `${item.kind}-template.${format}`), bytes, { mode: 0o600 });
      if (format === 'csv') assert.deepEqual(Papa.parse(bytes.toString('utf8').trim()).data[0], item.headers);
      else { const book = new ExcelJS.Workbook(); await book.xlsx.load(bytes); assert.deepEqual(book.worksheets[0].getRow(1).values.slice(1), item.headers); }
    }
    assert.equal(snapshot(), before);
    assert.equal((await request('/templates/unknown')).status, 400);
    assert.equal((await request('/templates/products?format=pdf')).status, 400);
  });

  await t.test('every route authenticates and rejects a non-admin before parsing uploads', async () => {
    for (const url of ['/templates', '/templates/products']) {
      assert.equal((await request(url, {}, null)).status, 401);
      assert.equal((await request(url, {}, 'PURCHASE')).status, 403);
    }
    for (const kind of templates.map(row => row.kind)) for (const action of ['preview', 'execute']) {
      assert.equal((await request(`/catalog/${kind}/${action}`, { method: 'POST' }, null)).status, 401);
      assert.equal((await request(`/catalog/${kind}/${action}`, { method: 'POST' }, 'PURCHASE')).status, 403);
    }
  });

  const productRows = [['合成商品', '规格A', '件', '0123456789', '仅测试']];
  await t.test('product CSV/xlsx preview agrees and execution preserves fields without changing contracts', async () => {
    const before = snapshot();
    const csv = await upload('products', productRows);
    const xlsx = await upload('products', productRows, 'preview', 'xlsx');
    assert.equal(csv.status, 200); assert.equal(csv.body.data.canImport, true);
    assert.deepEqual(xlsx.body.data, csv.body.data);
    assert.equal(snapshot(), before);
    if (evidence) fs.writeFileSync(path.join(evidence, 'products-preview.json'), JSON.stringify(csv.body, null, 2), { mode: 0o600 });
    assert.equal((await upload('products', productRows, 'execute', 'xlsx')).status, 200);
    const saved = await db.product.findFirst(); assert.equal(saved.hsCode, '0123456789'); assert.equal(saved.specification, '规格A');
    assert.equal((await upload('products', productRows, 'execute')).status, 400);
    assert.equal(await db.product.count(), 1); assert.equal(await db.purchaseContract.count(), 0); assert.equal(await db.salesContract.count(), 0);
  });
  await t.test('suppliers validate required fields/email/duplicates and import only explicit catalog fields', async () => {
    const before = snapshot();
    const invalid = await upload('suppliers', [['', '', '', '', 'bad', ''], ['重复', '', '', '', '', ''], ['重复', '', '', '', '', '']]);
    assert.equal(invalid.body.data.summary.invalid, 2); assert.equal(snapshot(), before);
    assert.equal((await upload('suppliers', [['合成供应商', '合成', '合成联系人', '000', 'synthetic@example.invalid', '合成地址']], 'execute')).status, 200);
    const saved = await db.supplier.findFirst(); assert.equal(saved.shortName, '合成'); assert.equal(saved.bankAccount, null);
  });
  await t.test('store requires a real port and whole batch rejects stale/invalid rows without writes', async () => {
    await db.port.create({ data: { code: 'SYN', name: '合成港' } });
    const rows = [['合成门店', 'SYN', '', '', '', '']];
    const before = snapshot(); assert.equal((await upload('stores', rows, 'preview', 'xlsx')).body.data.canImport, true); assert.equal(snapshot(), before);
    assert.equal((await upload('stores', [rows[0], ['坏门店', 'UNKNOWN', '', '', '', '']], 'execute')).status, 400); assert.equal(snapshot(), before);
    assert.equal((await upload('stores', rows, 'execute', 'xlsx')).status, 200);
    assert.equal((await db.store.findFirst({ include: { port: true } })).port.code, 'SYN');
    const stale = snapshot(); assert.equal((await upload('stores', rows, 'execute')).status, 400); assert.equal(snapshot(), stale);
  });
  await t.test('opening stock dry-run cannot write; confirmed execution is traceable, repeat-safe and preserves procurement evidence', async () => {
    const product = await db.product.findFirst();
    const rows = [['SYN-OPEN-001', product.id, '12.5', '件', '2026-01-01', '合成盘点']];
    const before = snapshot();
    const preview = await upload('opening-inventory', rows, 'preview', 'xlsx');
    assert.equal(preview.body.data.canImport, true); assert.equal(snapshot(), before);
    assert.equal((await upload('opening-inventory', rows, 'execute')).status, 400); assert.equal(snapshot(), before);
    assert.equal((await upload('opening-inventory', rows, 'execute', 'xlsx', true)).status, 200);
    const saved = await db.inventory.findUnique({ where: { id: 'opening:SYN-OPEN-001' } });
    assert.equal(saved.quantity, 12.5); assert.equal(saved.status, 'INBOUND'); assert.equal(saved.inboundAt.toISOString(), '2026-01-01T00:00:00.000Z');
    assert.equal(saved.purchaseItemId, null); assert.equal(saved.receiptInspectionId, null); assert.match(saved.note, /OPENING:SYN-OPEN-001/);
    const after = snapshot();
    assert.equal((await upload('opening-inventory', rows, 'execute', 'csv', true)).status, 400); assert.equal(snapshot(), after);
    assert.equal(await db.purchaseReceiptInspection.count(), 0);
    assert.equal(await db.operationLog.count({ where: { entity: 'CatalogImport' } }), 4);
    if (evidence) fs.writeFileSync(path.join(evidence, 'opening-inventory-result.json'), JSON.stringify({ preview: preview.body, saved, auditCount: 4 }, null, 2), { mode: 0o600 });
  });
  await t.test('opening validation rejects bad references, missing/inactive products, units, dates and non-positive/non-finite quantities', async () => {
    const product = await db.product.findFirst();
    const baseRow = ['SYN-INVALID', product.id, '1', '件', '2026-01-01', ''];
    const cases = [[0, '../invalid'], [1, 'missing'], [2, '0'], [2, '-1'], [2, 'NaN'], [2, '1junk'], [2, '1e999'], [3, '箱'], [4, '2026-02-30'], [4, '2999-01-01']];
    const before = snapshot();
    for (const [column, value] of cases) {
      const row = [...baseRow]; row[column] = value;
      assert.equal((await upload('opening-inventory', [row])).body.data.canImport, false);
      assert.equal((await upload('opening-inventory', [row], 'execute', 'csv', true)).status, 400);
    }
    assert.equal(snapshot(), before);
    await db.product.update({ where: { id: product.id }, data: { isActive: false } });
    assert.equal((await upload('opening-inventory', [baseRow])).body.data.canImport, false);
  });
});
