/**
 * Input: Generated XLS/XLSX, existing library CLI, actual auth/Express and committed-migration SQLite
 * Output: Five independent ingest, metadata, ordered row, filter and authorization acceptance cases
 * Pos: Financial library source acceptance; distinct from monthly workbook upload/import
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const XLSX = require('xlsx');
const { execFileSync } = require('node:child_process');
const { createSources, applyMigrations, runImport, readDatabase } = require('../testHelpers/financial-library-data');

test('HTTP/SQLite: financial library ingests existing synthetic sources and preserves restricted row readbacks', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-financial-library-'));
  fs.chmodSync(directory, 0o700);
  process.env.DATABASE_URL = `file:${path.join(directory, 'synthetic.db')}`;
  process.env.UPLOAD_DIR = path.join(directory, 'uploads');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-only-financial-library-never-production';
  process.env.TZ = 'UTC';
  let db, server;
  t.after(async () => {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    if (db) await db.$disconnect();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  applyMigrations(path.join(directory, 'synthetic.db'));
  db = require('../utils/prisma');
  const tokens = {};
  for (const role of ['ADMIN', 'FINANCE', 'BOSS', 'PURCHASE', 'SALES', 'WAREHOUSE', 'INACTIVE']) {
    const user = await db.user.create({ data: { username: `synthetic-library-${role}`, name: `Synthetic ${role}`, password: 'test-only-unused-hash', role: role === 'INACTIVE' ? 'FINANCE' : role, isActive: role !== 'INACTIVE' } });
    tokens[role] = require('jsonwebtoken').sign({ userId: user.id, role: 'ADMIN' }, process.env.JWT_SECRET);
  }
  const period = await db.financialPeriod.create({ data: { year: 2026, month: 10, periodLabel: 'Synthetic 2026-10', reportDate: new Date('2026-10-31T00:00:00Z') } });
  const sources = createSources(directory);
  const snapshot = () => readDatabase(directory);
  const libraryTables = new Set(['financial_evidence_documents', 'financial_evidence_sheets', 'financial_evidence_rows']);
  const unrelated = () => Object.fromEntries(Object.entries(snapshot()).filter(([table]) => !libraryTables.has(table)));
  const before = unrelated();
  const app = require('../app');
  server = await new Promise(resolve => { const started = app.listen(0, '127.0.0.1', () => resolve(started)); });
  const base = `http://127.0.0.1:${server.address().port}/api/v1/finance/statements/evidence`;
  /**
   * 职责：调用完整真实认证GET，故意不信任JWT角色声明。
   * @param {string} route 相对资料库路径
   * @param {object} query 查询参数
   * @param {string} role 数据库角色
   * @param {number} expected 预期HTTP状态
   * @returns {Promise<object>} 实际响应数据
   */
  const get = async (route, query = {}, role = 'FINANCE', expected = 200) => {
    const response = await fetch(`${base}${route}?${new URLSearchParams(query)}`, { headers: tokens[role] ? { authorization: `Bearer ${tokens[role]}` } : {} });
    const body = await response.json();
    assert.equal(response.status, expected, `${role} GET ${route}: ${body.message}`);
    return body.data;
  };
  let ledger, payroll;
  await t.test('dry-run is nonmutating; confirmation ingests two sources and repeated confirmation is a complete no-op', async () => {
    const untouched = snapshot();
    const dryRun = JSON.parse(runImport(directory));
    assert.equal(dryRun.mode, 'dry-run');
    assert.equal(dryRun.workbookCount, 4);
    assert.equal(dryRun.eligibleDocuments, 2);
    assert.deepEqual(dryRun.ignored, { handledElsewhere: 1, unsupported: 1 });
    assert.equal(dryRun.rows, 61);
    assert.equal(dryRun.redactions, 8);
    assert.deepEqual(snapshot(), untouched);
    assert.match(runImport(directory, true), /"imported": 2/);
    const imported = snapshot();
    assert.match(runImport(directory, true), /"skipped": 2/);
    assert.deepEqual(snapshot(), imported);
    assert.deepEqual(unrelated(), before, 'library ingestion never writes monthly statement/business tables');
    assert.deepEqual(fs.readdirSync(process.env.UPLOAD_DIR), [], 'no source enters ordinary attachment storage');
  });

  await t.test('source identity, counts and linked period match independent original bytes and stored facts', async () => {
    const list = await get('/documents', { pageSize: 100 });
    assert.equal(list.total, 2);
    ledger = list.items.find(document => document.category === 'GENERAL_LEDGER');
    payroll = list.items.find(document => document.category === 'PAYROLL');
    const saved = snapshot();
    assert.equal(saved.financial_evidence_documents.length, 2);
    for (const [document, source, counts] of [[ledger, sources[0], [3, 2, 58, 0]], [payroll, sources[1], [1, 1, 3, 8]]]) {
      assert.equal(document.fileName, source.fileName);
      assert.equal(document.relativePath, source.relativePath);
      assert.equal(document.fileSize, source.bytes.length);
      assert.equal(document.contentSha256, crypto.createHash('sha256').update(source.bytes).digest('hex'));
      assert.equal(document.originalArchived, false);
      assert.deepEqual([document.sourceSheetCount, document.importedSheetCount, document.rowCount, document.redactionCount], counts);
      assert.equal(document.periodYear, 2026);
      assert.equal(document.periodMonth, document === ledger ? 10 : 9);
      assert.equal(document.periodId, document === ledger ? period.id : null);
      const sql = saved.financial_evidence_documents.find(row => row.id === document.id);
      for (const field of ['fileName', 'relativePath', 'fileSize', 'contentSha256', 'sourceKey', 'rowCount', 'redactionCount']) assert.equal(sql[field], document[field]);
    }
    const summary = await get('/summary');
    assert.deepEqual(summary.totals, { documentCount: 2, sheetCount: 3, rowCount: 61, redactionCount: 8 });
    assert.deepEqual(summary.periods, ['2026-09', '2026-10']);
  });

  await t.test('real detail pagination preserves physical row gaps, cached values, null, zero, negative and boolean cells', async () => {
    const first = await get(`/documents/${ledger.id}`, { pageSize: 50 });
    assert.deepEqual(first.sheets.map(sheet => [sheet.sheetIndex, sheet.sheetName, sheet.rowCount]), [[0, '总账', 56], [1, '备注', 2]]);
    assert.deepEqual(first.pagination, { page: 1, pageSize: 50, total: 56, totalPages: 2 });
    assert.deepEqual(first.rows.slice(0, 3).map(row => [row.sourceRow, row.rowKind]), [[1, 'HEADER'], [3, 'HEADER'], [4, 'DATA']]);
    assert.deepEqual(first.rows[2].values, ['合成账行1', 125.5, 0, -20.25, 'SYNTHETIC-BIZ-ID', null, true]);
    const last = await get(`/documents/${ledger.id}`, { sheetId: first.selectedSheet.id, page: 2, pageSize: 50 });
    assert.deepEqual(last.rows.map(row => row.sourceRow), [52, 53, 54, 55, 56, 58]);
    assert.deepEqual(last.rows.at(-1).values, ['合计', 645.5, 0, -20.25]);
    assert.equal(last.rows.at(-1).rowKind, 'TOTAL');
    const notes = await get(`/documents/${ledger.id}`, { sheetId: first.sheets[1].id });
    assert.deepEqual(notes.rows.map(row => [row.sourceRow, row.values]), [[2, ['合成来源备注', true, null, 0]], [12, ['保留尾注', -7.5]]]);
    const sql = snapshot();
    const savedSheet = sql.financial_evidence_sheets.find(row => row.id === first.selectedSheet.id);
    assert.equal(savedSheet.formulaCellCount, 1);
    assert.equal(savedSheet.sourceRange, 'A1:G58');
    const savedRow = sql.financial_evidence_rows.find(row => row.sheetId === savedSheet.id && row.sourceRow === 4);
    assert.deepEqual(JSON.parse(savedRow.valuesJson), ['合成账行1', 125.5, 0, -20.25, 'SYNTHETIC-BIZ-ID', null, true]);
  });

  await t.test('redactions precede persistence; category/period filters and foreign-sheet details do not mix sources', async () => {
    const detail = await get(`/documents/${payroll.id}`);
    assert.deepEqual(detail.rows[1].values, [1, '<已脱敏>', '<已脱敏>', '<已脱敏>', '<已脱敏>', 1234.5]);
    assert.deepEqual(detail.rows[2].values, [2, '<已脱敏>', '<已脱敏>', '<已脱敏>', '<已脱敏>', 0]);
    const stored = snapshot().financial_evidence_rows.filter(row => row.sheetId === detail.selectedSheet.id);
    assert.doesNotMatch(JSON.stringify(stored), /合成员工甲|合成员工乙|13800000000|13900000000|11010119900101|synthetic-a@|synthetic-b@/);
    const filtered = await get('/documents', { category: 'PAYROLL', year: 2026, month: 9 });
    assert.deepEqual(filtered.items.map(document => document.id), [payroll.id]);
    assert.equal((await get('/documents', { category: 'PAYROLL', year: 2026, month: 10 })).total, 0);
    assert.deepEqual((await get(`/documents/${ledger.id}`, { sheetId: detail.selectedSheet.id })).rows, []);
    await get('/documents/synthetic-missing-document', {}, 'FINANCE', 404);
    assert.deepEqual(unrelated(), before);
  });

  await t.test('ADMIN and FINANCE read identical stored facts; all other current roles and inactive/anonymous callers are denied without writes', async () => {
    const original = snapshot();
    const finance = await get(`/documents/${ledger.id}`);
    assert.deepEqual(await get(`/documents/${ledger.id}`, {}, 'ADMIN'), finance);
    for (const route of ['/summary', '/documents', `/documents/${ledger.id}`]) {
      for (const role of ['BOSS', 'PURCHASE', 'SALES', 'WAREHOUSE', 'INACTIVE', 'ANONYMOUS']) {
        await get(route, {}, role, ['INACTIVE', 'ANONYMOUS'].includes(role) ? 401 : 403);
      }
    }
    assert.deepEqual(snapshot(), original);
    assert.deepEqual(unrelated(), before);
    assert.deepEqual(fs.readdirSync(process.env.UPLOAD_DIR), []);
  });

  await t.test('snapshot CLI adds monthly reports and cumulative ledger without changing old records; revisions append and failures roll back', async () => {
    const service = require('../services/financialEvidenceService');
    const create = (sheets) => {
      const book = XLSX.utils.book_new();
      for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), name);
      return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
    };
    const buffers = [
      create(Object.fromEntries(['资产负债表', '利润表', '现金流量表'].map(name => [name, [[name], ['企业名称：合成企业', '2026-10'], ['项目', '金额'], ['合成金额', 123.45]]]))),
      create({ 科目余额表: [['科目余额表'], ['核算单位：合成企业', null, null, '期间：2026年10月-2026年10月'], ['科目编码', '科目名称', '余额'], ['1001', '现金', 123.45]] }),
      create({ 明细账: [['明细账'], ['编制单位：合成企业', null, null, '期间：2026年1月-2026年9月'], ['科目编码', '科目名称', '日期', '凭证号', '摘要', '借方', '贷方', '方向', '余额'], ['1001', '现金', '2026-01-02', '合成-1', '合成业务', 100, 0, '借', 100], ['1001', '现金', '2026-09-30', '合成-2', '合成业务', 0, 10, '借', 90]] }),
    ];
    const files = buffers.map((buffer, index) => {
      const file = path.join(directory, `synthetic-snapshot-${index}.xlsx`);
      fs.writeFileSync(file, buffer, { mode: 0o600 });
      return file;
    });
    let confirmation = 0;
    const run = confirm => execFileSync(process.execPath, [path.resolve(__dirname, '../../scripts/retain-financial-snapshots.js'), ...files, ...(confirm ? ['--confirm', '--backup-dir', directory, '--receipt', path.join(directory, `snapshot-receipt-${++confirmation}.json`)] : [])], {
      env: { ...process.env, DATABASE_URL: `file:${path.join(directory, 'synthetic.db')}` }, encoding: 'utf8', timeout: 30000,
    });
    const old = snapshot();
    assert.match(run(false), /"mode":"preview"/);
    assert.deepEqual(snapshot(), old);
    assert.match(run(true), /"imported":3,"skipped":0,"replaced":0/);
    const added = snapshot();
    assert.deepEqual(unrelated(), before);
    for (const table of libraryTables) {
      const oldIds = new Set(old[table].map(row => row.id));
      assert.deepEqual(added[table].filter(row => oldIds.has(row.id)), old[table]);
    }
    const cumulativeList = await get('/documents', { category: 'GENERAL_LEDGER_CUMULATIVE_SNAPSHOT', year: 2026 });
    assert.equal(cumulativeList.total, 1);
    const cumulative = cumulativeList.items[0];
    assert.equal(cumulative.periodMonth, null);
    assert.equal(cumulative.periodId, null);
    assert.match(cumulative.categoryLabel, /2026年1—9月累计/);
    const detail = await get(`/documents/${cumulative.id}`);
    assert.deepEqual(detail.rows.slice(3).map(row => row.values.slice(2)), [
      ['2026-01-02', '合成-1', '合成业务', 100, 0, '借', 100],
      ['2026-09-30', '合成-2', '合成业务', 0, 10, '借', 90],
    ]);
    assert.equal((await get('/documents', { category: cumulative.category, year: 2026, month: 9 })).total, 0);
    const monthly = await get('/documents', { category: 'MONTHLY_STATEMENT_SNAPSHOT', year: 2026, month: 10 });
    assert.equal(monthly.items[0].periodId, period.id);
    assert.equal(monthly.items[0].importedSheetCount, 3);
    assert.equal(monthly.items[0].contentSha256, crypto.createHash('sha256').update(buffers[0]).digest('hex'));
    await get(`/documents/${cumulative.id}`, {}, 'BOSS', 403);
    assert.match(run(true), /"imported":0,"skipped":3,"replaced":0/);
    assert.deepEqual(snapshot(), added);

    const revised = XLSX.read(buffers[2], { type: 'buffer' });
    revised.Sheets['明细账'].F4.v = 101;
    const revision = service.parseFinancialEvidenceSnapshot({ buffer: XLSX.write(revised, { type: 'buffer', bookType: 'xlsx' }), fileName: path.basename(files[2]) });
    assert.equal((await service.appendFinancialEvidenceSnapshots([revision], db)).imported, 1);
    const revisedState = snapshot();
    for (const table of libraryTables) {
      const addedIds = new Set(added[table].map(row => row.id));
      assert.deepEqual(revisedState[table].filter(row => addedIds.has(row.id)), added[table]);
    }
    assert.deepEqual(unrelated(), before);

    await assert.rejects(service.appendFinancialEvidenceSnapshots([{ ...revision, contentSha256: 'synthetic-conflict' }], db), /拒绝覆盖/);
    assert.deepEqual(snapshot(), revisedState);
    await db.$executeRawUnsafe(`CREATE TRIGGER synthetic_snapshot_failure BEFORE INSERT ON financial_evidence_rows WHEN NEW.searchText LIKE '%FAIL-ARCHIVE%' BEGIN SELECT RAISE(ABORT, 'synthetic archive rollback'); END`);
    const nextBook = XLSX.read(buffers[0], { type: 'buffer' });
    nextBook.Sheets['利润表'].B4.v = 456;
    const next = service.parseFinancialEvidenceSnapshot({ buffer: XLSX.write(nextBook, { type: 'buffer', bookType: 'xlsx' }), fileName: 'synthetic-next.xlsx' });
    const failing = structuredClone(revision);
    failing.sourceKey = 'synthetic-late-failure';
    failing.sheets[0].rows.at(-1).searchText = 'FAIL-ARCHIVE';
    await assert.rejects(service.appendFinancialEvidenceSnapshots([next, failing], db));
    assert.deepEqual(snapshot(), revisedState, '晚期插入失败时前一文档也必须回滚');
    await db.$executeRawUnsafe('DROP TRIGGER synthetic_snapshot_failure');
    assert.deepEqual(fs.readdirSync(process.env.UPLOAD_DIR), []);
  });
});
