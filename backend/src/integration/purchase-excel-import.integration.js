/**
 * Input: active multipart purchase import, generated workbooks and committed migrations
 * Output: six HTTP/SQLite workbook validation, value-preservation and replay cases
 * Pos: private synthetic Excel-import regression; no browser, providers or real records
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
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
  /**
   * 职责：构造一行合成采购汇总，可按列覆盖边界值
   * @param {string} contractNo 合成合同编号
   * @param {object} values 按表头指定的覆盖值
   * @returns {Array} 与导出表头顺序相同的合成行
   */
  const row = (contractNo, values = {}) => [contractNo, supplier.name, '2026-10-01', 1234.5, 'CNY', '草稿', '合成备注'].map((value, index) => Object.hasOwn(values, headers[index]) ? values[headers[index]] : value);
  /**
   * 职责：仅从指定合成公式单元格删除缓存值，保留公式来源作真实边界测试
   * @param {Buffer} bytes 内存生成的工作簿
   * @param {string[]} addresses 指定合成单元格地址
   * @returns {Buffer} 只移除指定缓存的 OOXML 工作簿
   * @throws {AssertionError} 原公式/缓存不存在或改写没有保持准确形状
   */
  const removeFormulaCaches = (bytes, addresses) => {
    const zip = new (require('adm-zip'))(bytes);
    const sheetPath = 'xl/worksheets/sheet1.xml';
    let xml = zip.getEntry(sheetPath).getData().toString();
    for (const address of addresses) {
      assert.match(address, /^[A-Z]+[1-9][0-9]*$/);
      const cell = xml.match(new RegExp(`<c\\b[^>]*\\br="${address}"[^>]*>[\\s\\S]*?<\\/c>`))?.[0];
      assert.ok(cell, 'synthetic target cell exists');
      assert.match(cell, /<f\b/);
      assert.match(cell, /<v\b/);
      const uncached = cell.replace(/<v\b[^>]*>[\s\S]*?<\/v>/, '');
      assert.match(uncached, /<f\b/);
      assert.doesNotMatch(uncached, /<v\b/);
      xml = xml.replace(cell, uncached);
    }
    zip.updateFile(sheetPath, Buffer.from(xml));
    return zip.toBuffer();
  };
  /**
   * 职责：把合成行编码为真实工作簿并封装 multipart
   * @param {Array[]} rows 合成行（可含原生错误或缓存公式单元格）
   * @param {object} options 表头、历史选项、范围起点及需移除的公式缓存
   * @returns {FormData} 仅发送至本测试 HTTP 服务的上传表单
   */
  const upload = (rows, { columns = headers, historical = false, origin = 'A1', uncachedFormulaCells = [] } = {}) => {
    const book = xlsx.utils.book_new();
    const sheet = xlsx.utils.aoa_to_sheet([]);
    xlsx.utils.sheet_add_aoa(sheet, [columns, ...rows], { origin });
    // SheetJS otherwise pads a new sheet's range back to A1. Model an actual
    // shifted worksheet range so provenance lookup must account for its origin.
    sheet['!ref'] = xlsx.utils.encode_range({ s: xlsx.utils.decode_cell(origin), e: xlsx.utils.decode_range(sheet['!ref']).e });
    xlsx.utils.book_append_sheet(book, sheet, '合成采购合同');
    const form = new FormData();
    if (historical) form.append('historical', 'true');
    let bytes = xlsx.write(book, { type: 'buffer', bookType: 'xlsx' });
    if (uncachedFormulaCells.length) bytes = removeFormulaCaches(bytes, uncachedFormulaCells);
    form.append('file', new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'synthetic-purchase.xlsx');
    return form;
  };
  /**
   * 职责：调用实际采购 Excel 导入并校验 HTTP 状态
   * @param {FormData} body 合成 multipart 表单
   * @param {object} options 测试角色和期望状态
   * @returns {Promise<object>} 导入结果 data
   * @throws {AssertionError} HTTP 状态与期望不符
   */
  const call = async (body, { role = 'PURCHASE', expected = 200 } = {}) => {
    const response = await fetch(`${base}/purchases/import`, { method: 'POST', headers: { authorization: `Bearer ${tokens[role]}` }, body });
    const result = await response.json();
    assert.equal(response.status, expected, result.message);
    return result.data;
  };
  /**
   * 职责：经独立只读 SQLite 连接读取全部业务值与时间戳
   * @returns {object} 合成数据库相关业务表的完整快照
   * @throws {Error} 独立查询执行失败
   */
  const snapshot = () => JSON.parse(execFileSync('python3', ['-c', `import sqlite3,sys,json
c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True)
c.row_factory=sqlite3.Row
tables=['purchase_contracts','purchase_items','suppliers','products','inventories','purchase_receipts','purchase_receipt_items','purchase_receipt_inspections','payments']
print(json.dumps({table:[dict(row) for row in c.execute('SELECT * FROM '+table+' ORDER BY id')] for table in tables}))
c.close()`, database], { encoding: 'utf8', timeout: 10000 }));
  /**
   * 职责：提取汇总导入绝不应改变的关联业务表
   * @returns {object} 不含采购合同头的完整快照
   */
  const unaffected = () => Object.fromEntries(Object.entries(snapshot()).filter(([table]) => table !== 'purchase_contracts'));
  const originalRelated = unaffected();

  await t.test('valid workbook preserves numeric, decimal-text, Excel-date and text semantics', async () => {
    const result = await call(upload([
      row('000001', { '签订日期': new Date('2026-10-02T00:00:00Z'), '总金额': 0, '备注': '  合成备注  内侧空格  ' }),
      row('SYNTHETIC-DECIMAL', { '签订日期': '2026/10/03', '总金额': '1,234.50', '状态': '生产中' }),
      row('SYNTHETIC-OPTIONAL-BLANK', { '签订日期': '', '总金额': '', '状态': '', '备注': '' }),
    ]));
    assert.deepEqual(result, { successRows: 3, failedRows: 0, errors: [] });
    // Only stored formula caches are read; this importer never evaluates formulas.
    const cachedDateSerial = (Date.parse('2026-10-04T00:00:00Z') - Date.parse('1899-12-30T00:00:00Z')) / 86400000;
    assert.deepEqual(await call(upload([
      row('SYNTHETIC-WHITESPACE', { '签订日期': '   ', '总金额': '   ' }),
      row('SYNTHETIC-NULL', { '签订日期': null, '总金额': null }),
      row('SYNTHETIC-LEAP', { '签订日期': '2024-02-29' }),
      row('SYNTHETIC-CACHED-FORMULA', { '签订日期': { t: 'n', v: cachedDateSerial, f: 'DATE(2026,10,4)', z: 'yyyy-mm-dd' }, '总金额': { t: 'n', v: 250.25, f: '100+150.25' } }),
      row('SYNTHETIC-CACHED-ZERO', { '总金额': { t: 'n', v: 0, f: '1-1' } }),
      row('SYNTHETIC-CACHED-EMPTY', { '签订日期': { t: 's', v: '', f: 'IF(TRUE,"",1)' }, '总金额': { t: 's', v: '', f: 'IF(TRUE,"",1)' } }),
    ])), { successRows: 6, failedRows: 0, errors: [] });
    assert.deepEqual(await call(upload([['SYNTHETIC-OMITTED', supplier.name]], { columns: ['合同编号', '供应商名称'] })), { successRows: 1, failedRows: 0, errors: [] });
    const contracts = snapshot().purchase_contracts;
    for (const [contractNo, amount, date, status, note] of [
      ['000001', 0, Date.parse('2026-10-02T00:00:00Z'), 'DRAFT', '合成备注  内侧空格'],
      ['SYNTHETIC-DECIMAL', 1234.5, Date.parse('2026-10-03T00:00:00Z'), 'PRODUCING', '合成备注'],
      ['SYNTHETIC-OPTIONAL-BLANK', 0, null, 'DRAFT', null],
      ['SYNTHETIC-WHITESPACE', 0, null, 'DRAFT', '合成备注'],
      ['SYNTHETIC-NULL', 0, null, 'DRAFT', '合成备注'],
      ['SYNTHETIC-LEAP', 1234.5, Date.parse('2024-02-29T00:00:00Z'), 'DRAFT', '合成备注'],
      ['SYNTHETIC-OMITTED', 0, null, 'DRAFT', null],
      ['SYNTHETIC-CACHED-FORMULA', 250.25, Date.parse('2026-10-04T00:00:00Z'), 'DRAFT', '合成备注'],
      ['SYNTHETIC-CACHED-ZERO', 0, Date.parse('2026-10-01T00:00:00Z'), 'DRAFT', '合成备注'],
      ['SYNTHETIC-CACHED-EMPTY', 0, null, 'DRAFT', '合成备注'],
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
      { '总金额': ',' },
      { '总金额': ',,' },
      { '总金额': ' , ' },
      { '总金额': { t: 'e', v: 7 } }, // Real Excel #DIV/0! cell, not a literal text marker.
      { '签订日期': { t: 'e', v: 15 } }, // Real Excel #VALUE! cell.
      { '签订日期': 0 },
      { '签订日期': 60 }, // Excel's fictitious 1900-02-29.
      { '签订日期': 2958466 },
      { '签订日期': '2026-01-00' },
      { '签订日期': '2026-00-01' },
      { '签订日期': '2026-02-29' },
    ];
    const noCacheRows = [
      row('SYNTHETIC-NO-CACHE-AMOUNT', { '总金额': { t: 'n', v: 1234.5, f: '1234+0.5' } }),
      row('SYNTHETIC-NO-CACHE-DATE', { '签订日期': { t: 'n', v: 46301, f: 'DATE(2026,10,6)' } }),
    ];
    const invalidCount = invalid.length + noCacheRows.length;
    const result = await call(upload([
      ...invalid.map((values, index) => row(`SYNTHETIC-INVALID-${index}`, values)), ...noCacheRows,
    ], { uncachedFormulaCells: [`D${invalid.length + 2}`, `C${invalid.length + 3}`] }));
    assert.equal(result.successRows, 0, 'invalid provided values must not import as zero, null or a different date');
    assert.equal(result.failedRows, invalidCount);
    assert.deepEqual(result.errors.map(error => error.row), Array.from({ length: invalidCount }, (_, index) => index + 2));
    for (const error of result.errors.slice(-2)) assert.match(error.error, /公式.*重新计算.*保存/);
    assert.deepEqual(snapshot(), before);
    const shiftedErrors = await call(upload([
      row('SYNTHETIC-SHIFTED-ERROR-AMOUNT', { '总金额': { t: 'e', v: 7 } }),
      row('SYNTHETIC-SHIFTED-ERROR-DATE', { '签订日期': { t: 'e', v: 15 } }),
    ], { origin: 'C3' }));
    assert.equal(shiftedErrors.successRows, 0);
    assert.equal(shiftedErrors.failedRows, 2);
    assert.deepEqual(shiftedErrors.errors.map(error => error.row), [2, 3], 'preserve existing range-relative displayed row numbering');
    assert.deepEqual(snapshot(), before);
    const mixed = await call(upload([
      row('SYNTHETIC-INVALID-BOUNDARY-BEFORE'),
      ...invalid.map((values, index) => row(`SYNTHETIC-INVALID-${index}`, values)),
      ...noCacheRows,
      row('SYNTHETIC-INVALID-BOUNDARY-AFTER'),
    ], { uncachedFormulaCells: [`D${invalid.length + 3}`, `C${invalid.length + 4}`] }));
    assert.equal(mixed.successRows, 2);
    assert.equal(mixed.failedRows, invalidCount);
    assert.deepEqual(mixed.errors.map(error => error.row), Array.from({ length: invalidCount }, (_, index) => index + 3));
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
