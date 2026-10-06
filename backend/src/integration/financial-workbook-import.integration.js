/**
 * Input: actual authenticated multipart finance routes, synthetic XLSX and committed migrations
 * Output: financial preview/confirmation, HTTP readback and independent SQL/literal amount/source acceptance
 * Pos: isolated financial import regression; no production data, providers or archived workbooks
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

/**
 * 职责：生成既有固定行次布局的合成月报，公式缓存仅使用独立字面量，不计算公式。
 * @param {object} options 公式/空白/现金流与测试账期选项
 * @returns {Promise<Buffer>} 内存 XLSX
 */
async function statement({ formulas = false, missingCache, blank = false, cashFlow = true, month = 10, assets = 1000.25, missingSheet = false, cacheResult, stringMissingCache = false, literalText = false } = {}) {
  const ExcelJS = require('exceljs');
  const workbook = new ExcelJS.Workbook();
  const balance = workbook.addWorksheet('资产负债表');
  const income = workbook.addWorksheet('利润表');
  const cash = cashFlow ? workbook.addWorksheet('现金流量表') : null;
  for (const sheet of [balance, income, cash].filter(Boolean)) {
    sheet.getCell('A2').value = '企业名称: 合成财务验收公司';
    sheet.getCell('E2').value = `2026-${String(month).padStart(2, '0')}`;
  }
  /**
   * 职责：写入独立合成数值或其已知公式缓存，不计算公式。
   * @param {import('exceljs').Worksheet} sheet 合成工作表
   * @param {string} address 固定单元格地址
   * @param {number} number 独立夹具字面量
   * @returns {void} 原地设置合成单元格
   */
  const value = (sheet, address, number) => {
    sheet.getCell(address).value = formulas ? { formula: String(number), result: number } : number;
  };
  for (const [address, number] of [['B4', 30], ['F5', 47], ['F6', 52], ['B7', 1], ['B8', 9], ['F9', 51]]) balance.getCell(address).value = number;
  for (const [address, number] of [['C4', assets], ['G5', 400.1], ['G6', 600.15], ['C7', 300.25], ['C8', 0], ['G9', -25.5]]) value(balance, address, number);
  for (const [address, number] of [['B4', 1], ['B5', 2], ['B6', 32], ['B7', 14], ['B8', 18]]) income.getCell(address).value = number;
  for (const [address, number] of [['C4', 5000.75], ['D4', 800.25], ['C5', 3210.25], ['D5', 500.1], ['C6', 900.5], ['D6', 120.15], ['C7', 0], ['D7', 0], ['C8', -20.5], ['D8', -5.25]]) value(income, address, number);
  if (cash) {
    for (const [address, number] of [['B5', 7], ['B6', 13], ['B7', 21], ['B8', 22]]) cash.getCell(address).value = number;
    for (const [address, number] of [['C5', 730.75], ['D5', 50.25], ['C6', 0], ['D6', 0], ['C7', 250], ['D7', 300], ['C8', 300], ['D8', 350.25]]) value(cash, address, number);
  }
  if (blank) {
    income.getCell('D4').value = null;
    income.getCell('D5').value = null;
  }
  if (literalText) {
    balance.getCell('C4').value = '1000.25';
    income.getCell('C4').value = '5000.75';
  }
  if (missingCache) {
    const [sheetName, address] = missingCache;
    workbook.getWorksheet(sheetName).getCell(address).value = cacheResult === undefined ? { formula: '1-1' } : { formula: '1-1', result: cacheResult };
  }
  if (missingSheet) workbook.removeWorksheet(income.id);
  const bytes = Buffer.from(await workbook.xlsx.writeBuffer());
  if (!stringMissingCache) return bytes;
  // Fault-inject only the known synthetic cache node. Both installed readers
  // conflate this string-typed missing node with a legitimate empty-string cache.
  const zip = new (require('adm-zip'))(bytes);
  const sheetPath = 'xl/worksheets/sheet2.xml';
  const xml = zip.getEntry(sheetPath).getData().toString();
  const cell = xml.match(/<c\b[^>]*r="D7"[^>]*>[\s\S]*?<\/c>/)?.[0];
  assert.match(cell, /t="str"/);
  assert.match(cell, /<v><\/v>/);
  const noCache = cell.replace('<v></v>', '');
  assert.doesNotMatch(noCache, /<v\b/);
  zip.updateFile(sheetPath, Buffer.from(xml.replace(cell, noCache)));
  return zip.toBuffer();
}

/**
 * 职责：生成三文件入口已有企业/账期/行次布局的合成来源，保留汇总行和前导零科目编码。
 * @param {object} options 合成账期、现金流及明细替换选项
 * @returns {Promise<object>} 三类内存工作簿和非真实文件名
 */
async function bundle({ month = 12, ledgerSummary = '合成收款', company = '合成财务验收公司', trialPeriod = month, ...statementOptions } = {}) {
  const XLSX = require('xlsx');
  /**
   * 职责：按既有布局把合成源行写入内存工作簿。
   * @param {string} sheetName 真实导入契约Sheet名称
   * @param {Array[]} rows 独立合成标题和数据行
   * @returns {Buffer} 合成XLSX字节
   */
  const bytes = (sheetName, rows) => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), sheetName);
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  };
  const period = `2026年${month}月-2026年${month}月`;
  return {
    statement: { buffer: await statement({ month, ...statementOptions }), fileName: 'synthetic-bundle-statement.xlsx' },
    trialBalance: { fileName: 'synthetic-trial.xlsx', buffer: bytes('科目余额表', [
      ['科目余额表'], ['核算单位: ' + company, null, null, `期间: 2026年${trialPeriod}月-2026年${trialPeriod}月`],
      ['科目编码', '科目名称', '期初余额', null, '本期发生额', null, '本年累计', null, '期末余额', null],
      [null, null, '借方', '贷方', '借方', '贷方', '借方', '贷方', '借方', '贷方'],
      ['001002', '合成银行科目', 300.25, 0, 50.25, 0, 730.75, 0, 350.5, 0],
      [null, '合成小计', 300.25, 0, 50.25, 0, 730.75, 0, 350.5, 0],
      [null, '总计', 1000.25, 1000.25, 500.1, 500.1, 3210.25, 3210.25, 1500.5, 1500.5],
    ]) },
    generalLedger: { fileName: 'synthetic-ledger.xlsx', buffer: bytes('明细账', [
      ['明细账'], ['编制单位: 合成财务验收公司', null, null, `期间: ${period}`],
      ['科目编码', '科目名称', '日期', '凭证号', '摘要', '借方', '贷方', '方向', '余额'],
      ['001002', '合成银行科目', `2026-${month}-01`, null, '期初余额', null, null, '借', 300.25],
      ['001002', '合成银行科目', `2026-${month}-10`, 'SYNTHETIC-1', ledgerSummary, 50.25, 0, '借', 350.5],
      ['001002', '合成银行科目', `2026-${month}-31`, null, '本期合计', 50.25, 0, '借', 350.5],
      ['001002', '合成银行科目', `2026-${month}-31`, null, '本年累计', 730.75, 0, '借', 350.5],
    ]) },
  };
}

test('HTTP/SQLite: financial workbook imports preserve cached source amounts and explicit confirmation', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-financial-import-'));
  fs.chmodSync(directory, 0o700);
  const database = path.join(directory, 'synthetic.db');
  process.env.DATABASE_URL = `file:${database}`;
  process.env.UPLOAD_DIR = path.join(directory, 'uploads');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-only-financial-import-never-for-production';
  process.env.TZ = 'UTC';
  fs.mkdirSync(process.env.UPLOAD_DIR, { mode: 0o700 });
  let db, server;
  t.after(async () => {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    if (db) await db.$disconnect();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const migrations = path.resolve(__dirname, '../../prisma/migrations');
  const ddl = fs.readdirSync(migrations).sort().filter(name => fs.statSync(path.join(migrations, name)).isDirectory())
    .map(name => fs.readFileSync(path.join(migrations, name, 'migration.sql'), 'utf8')).join('\n');
  execFileSync('python3', ['-c', 'import sqlite3,sys,os; os.umask(0o077); c=sqlite3.connect(sys.argv[1]); c.executescript(sys.stdin.read()); c.close()', database], { input: ddl, timeout: 30000 });
  fs.chmodSync(database, 0o600);
  db = require('../utils/prisma');
  const tokens = {};
  for (const role of ['FINANCE', 'ADMIN', 'BOSS', 'PURCHASE', 'SALES', 'WAREHOUSE', 'INACTIVE']) {
    const user = await db.user.create({ data: { username: `synthetic-financial-import-${role}`, name: `Synthetic ${role}`, password: 'test-only-unused-hash', role: role === 'INACTIVE' ? 'FINANCE' : role, isActive: role !== 'INACTIVE' } });
    tokens[role] = require('jsonwebtoken').sign({ userId: user.id, role: 'ADMIN' }, process.env.JWT_SECRET);
  }
  await db.financialPeriod.create({ data: { year: 2025, month: 12, periodLabel: 'Synthetic unrelated 2025-12', reportDate: new Date('2025-12-31T00:00:00Z'), balanceSheet: { create: { totalAssets: 73, totalLiabilities: 3, totalEquity: 70 } } } });
  await db.payment.create({ data: { type: 'RECEIVABLE', amount: 900, currency: 'USD', paymentDate: new Date('2026-10-01T00:00:00Z') } });
  const app = require('../app');
  server = await new Promise(resolve => { const started = app.listen(0, '127.0.0.1', () => resolve(started)); });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  /**
   * 职责：独立只读连接比较全部持久化字段及时间戳。
   * @returns {object} 私有合成数据库快照
   */
  const snapshot = () => JSON.parse(execFileSync('python3', ['-c', `import sqlite3,sys,json
c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True)
c.row_factory=sqlite3.Row
tables=[row[0] for row in c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
print(json.dumps({table:[dict(row) for row in c.execute('SELECT * FROM "'+table+'" ORDER BY rowid')] for table in tables}))
c.close()`, database], { encoding: 'utf8', timeout: 10000 }));
  /**
   * 职责：调用完整认证/限流/HTTP路径，不替换控制器或服务。
   * @param {string} method HTTP方法
   * @param {string} route 真实API路径
   * @param {FormData|undefined} body 合成文件表单
   * @param {number} expected 预期状态
   * @param {string} role 真实数据库角色，JWT声明故意不可信
   * @returns {Promise<object>} 完整JSON响应
   */
  const call = async (method, route, body, expected = 200, role = 'FINANCE') => {
    const response = await fetch(base + route, { method, headers: tokens[role] ? { authorization: `Bearer ${tokens[role]}` } : {}, ...(body ? { body } : {}) });
    const result = await response.json();
    assert.equal(response.status, expected, `${method} ${route}: ${result.message}`);
    return result;
  };
  /**
   * 职责：构造当前单工作簿入口的真实multipart表单。
   * @param {Buffer} bytes 私有合成XLSX
   * @param {object} fields 账期及确认字段
   * @returns {FormData} 上传表单
   */
  const fileForm = (bytes, fields = {}) => {
    const form = new FormData();
    form.append('file', new Blob([bytes]), 'synthetic-statement.xlsx');
    for (const [key, value] of Object.entries({ year: 2026, month: 10, periodLabel: 'Synthetic 2026-10', ...fields })) form.append(key, String(value));
    return form;
  };
  /**
   * 职责：通过固定来源字段发送原三份合成文件及明确确认意图。
   * @param {object} sources 合成来源
   * @param {object} fields 账期/确认选项
   * @returns {FormData} 真实multipart表单
   */
  const bundleForm = (sources, fields = {}) => {
    const form = new FormData();
    for (const [key, source] of Object.entries(sources)) form.append(key, new Blob([source.buffer]), source.fileName);
    for (const [key, value] of Object.entries({ year: 2026, month: 12, periodLabel: 'Synthetic 2026-12', ...fields })) form.append(key, String(value));
    return form;
  };
  const importedTables = new Set(['financial_periods', 'balance_sheet_entries', 'income_statement_entries', 'cash_flow_statement_entries', 'account_balance_entries', 'general_ledger_entries', 'financial_data_sources']);
  /**
   * 职责：提取本入口不应改变的全部业务表；参数无。
   * @returns {object} 独立只读SQL中的非财务导入行
   */
  const unrelated = () => Object.fromEntries(Object.entries(snapshot()).filter(([table]) => !importedTables.has(table)));
  /**
   * 职责：把真实已存金额直接与独立夹具字面量比较，不经HTTP/Prisma读取服务。
   * @param {number} month 2026年合成账期月份
   * @param {object} options 明确的空值覆盖、现金流/证据和原文件元数据期望
   * @returns {void} 断言资产、月度/YTD、0、负数、合法空值、证据金额及来源字面量
   */
  const assertStoredAmounts = (month, { incomeOverrides = {}, cashFlow = false, evidence = false, sources, statementSheetCount = 3 } = {}) => {
    const saved = snapshot();
    const period = saved.financial_periods.find(row => row.year === 2026 && row.month === month);
    assert.ok(period, 'independent SQL contains the requested synthetic period');
    const balance = saved.balance_sheet_entries.find(row => row.periodId === period.id);
    const income = saved.income_statement_entries.find(row => row.periodId === period.id);
    assert.ok(balance); assert.ok(income);
    for (const [field, expected] of Object.entries({ totalAssets: 1000.25, totalLiabilities: 400.1, totalEquity: 600.15, cashAndEquivalents: 300.25, inventory: 0, accountsReceivable: null, retainedEarnings: -25.5 })) assert.equal(balance[field], expected, `SQL balance ${field}`);
    for (const [field, expected] of Object.entries({ revenueMonth: 800.25, revenueYTD: 5000.75, costOfSalesMonth: 500.1, costOfSalesYTD: 3210.25, netProfitMonth: 120.15, netProfitYTD: 900.5, adminExpensesMonth: 0, adminExpensesYTD: 0, financialExpensesMonth: -5.25, financialExpensesYTD: -20.5, ...incomeOverrides })) assert.equal(income[field], expected, `SQL income ${field}`);
    const cash = saved.cash_flow_statement_entries.find(row => row.periodId === period.id);
    if (cashFlow) {
      assert.ok(cash);
      for (const [field, expected] of Object.entries({ netOperatingCashFlowMonth: 50.25, netOperatingCashFlowYTD: 730.75, netInvestingCashFlowMonth: 0, netInvestingCashFlowYTD: 0, openingCashMonth: 300, openingCashYTD: 250, endingCashMonth: 350.25, endingCashYTD: 300, salesCashMonth: null })) assert.equal(cash[field], expected, `SQL cashflow ${field}`);
    } else assert.equal(cash, undefined, 'independent SQL has no retained cashflow row');
    if (evidence) {
      const account = saved.account_balance_entries.find(row => row.periodId === period.id && row.rowType === 'ACCOUNT');
      const entry = saved.general_ledger_entries.find(row => row.periodId === period.id && row.rowType === 'ENTRY');
      const opening = saved.general_ledger_entries.find(row => row.periodId === period.id && row.rowType === 'OPENING');
      assert.ok(account); assert.ok(entry); assert.ok(opening);
      assert.equal(account.accountCode, '001002');
      assert.equal(account.openingDebit, 300.25); assert.equal(account.openingCredit, 0);
      assert.equal(account.periodDebit, 50.25); assert.equal(account.periodCredit, 0);
      assert.equal(account.yearDebit, 730.75); assert.equal(account.yearCredit, 0);
      assert.equal(entry.debit, 50.25); assert.equal(entry.credit, 0); assert.equal(entry.balance, 350.5);
      assert.equal(opening.debit, null); assert.equal(opening.credit, null); assert.equal(opening.balance, 300.25);
    }
    if (sources) {
      const metadata = saved.financial_data_sources.filter(row => row.periodId === period.id);
      assert.equal(metadata.length, 3, 'independent SQL retains exactly three source records');
      for (const [key, type, fileName, sheetName, rowCount] of [
        ['statement', 'STATEMENT', 'synthetic-bundle-statement.xlsx', '资产负债表/利润表/现金流量表', statementSheetCount],
        ['trialBalance', 'TRIAL_BALANCE', 'synthetic-trial.xlsx', '科目余额表', 3],
        ['generalLedger', 'GENERAL_LEDGER', 'synthetic-ledger.xlsx', '明细账', 4],
      ]) {
        const source = metadata.find(row => row.type === type);
        assert.ok(source);
        assert.equal(source.fileName, fileName); assert.equal(source.sheetName, sheetName); assert.equal(source.rowCount, rowCount);
        assert.equal(source.fileSize, sources[key].buffer.length);
        assert.equal(source.sha256, crypto.createHash('sha256').update(sources[key].buffer).digest('hex'));
      }
    }
  };
  const originalUnrelated = unrelated();
  const prior = (await call('GET', '/finance/statements/2025/12')).data;

  await t.test('cached numeric formulas including zero and negative retain literal monthly/YTD facts after confirm and GET', async () => {
    const bytes = await statement({ formulas: true });
    const before = snapshot();
    const preview = (await call('POST', '/finance/statements/import-file/preview', fileForm(bytes))).data;
    assert.equal(preview.ready, true);
    assert.equal(preview.balanceSheet.totalAssets, 1000.25);
    assert.equal(preview.incomeStatement.adminExpensesMonth, 0);
    assert.equal(preview.incomeStatement.financialExpensesMonth, -5.25);
    assert.deepEqual(snapshot(), before, 'discarding preview leaves every database row unchanged');
    const confirmed = (await call('POST', '/finance/statements/import-file/confirm', fileForm(bytes, { previewId: preview.previewId }))).data;
    assert.equal(confirmed.imported, 1);
    assert.equal(confirmed.overwritten, false);
    const detail = (await call('GET', '/finance/statements/2026/10')).data;
    assert.equal(detail.balanceSheet.totalAssets, 1000.25);
    assert.equal(detail.balanceSheet.inventory, 0);
    assert.equal(detail.balanceSheet.accountsReceivable, null);
    assert.equal(detail.balanceSheet.retainedEarnings, -25.5);
    assert.equal(detail.incomeStatement.revenueMonth, 800.25);
    assert.equal(detail.incomeStatement.revenueYTD, 5000.75);
    assert.equal(detail.incomeStatement.costOfSalesMonth, 500.1);
    assert.equal(detail.incomeStatement.adminExpensesMonth, 0);
    assert.equal(detail.incomeStatement.financialExpensesMonth, -5.25);
    assertStoredAmounts(10);
    const after = snapshot();
    assert.deepEqual((await call('GET', '/finance/statements/2026/10')).data, detail);
    assert.deepEqual(snapshot(), after, 'HTTP readback does not rewrite stored snapshots');
    assert.deepEqual(fs.readdirSync(process.env.UPLOAD_DIR), [], 'financial workbooks never enter ordinary attachment storage');
  });

  await t.test('missing, error and nonnumeric formula caches reject with exact sheet, row and amount-field guidance', async () => {
    const before = snapshot();
    for (const cacheResult of [undefined, { error: '#DIV/0!' }, 'synthetic-nonnumeric', false]) {
      const bytes = await statement({ missingCache: ['利润表', 'D7'], cacheResult });
      const rejected = await call('POST', '/finance/statements/import-file/preview', fileForm(bytes), 400);
      assert.match(rejected.message, /利润表.*第7行.*D7.*本月金额/);
      assert.match(rejected.message, /重新计算.*保存/);
    }
    assert.deepEqual(snapshot(), before, 'an optional missing-cache formula must not become a plausible zero or blank');
  });

  await t.test('valid literals, genuine optional blanks and a cached empty-string formula stay importable and stored as null', async () => {
    const bytes = await statement({ blank: true, month: 11, missingCache: ['利润表', 'D7'], cacheResult: '', literalText: true });
    const fields = { month: 11, periodLabel: 'Synthetic 2026-11' };
    const before = snapshot();
    const preview = (await call('POST', '/finance/statements/import-file/preview', fileForm(bytes, fields))).data;
    assert.equal(preview.ready, true);
    assert.equal(preview.incomeStatement.revenueMonth, null);
    assert.equal(preview.incomeStatement.costOfSalesMonth, null);
    assert.deepEqual(snapshot(), before);
    await call('POST', '/finance/statements/import-file/confirm', fileForm(bytes, { ...fields, previewId: preview.previewId }));
    const detail = (await call('GET', '/finance/statements/2026/11')).data;
    assert.equal(detail.incomeStatement.revenueMonth, null);
    assert.equal(detail.incomeStatement.costOfSalesMonth, null);
    assert.equal(detail.incomeStatement.netProfitMonth, 120.15);
    assert.equal(detail.incomeStatement.adminExpensesMonth, null);
    assert.equal(detail.balanceSheet.totalAssets, 1000.25);
    assert.equal(detail.incomeStatement.revenueYTD, 5000.75);
    assert.equal(detail.reportDate, '2026-11-30T00:00:00.000Z');
    assertStoredAmounts(11, { incomeOverrides: { revenueMonth: null, costOfSalesMonth: null, adminExpensesMonth: null } });
    assert.deepEqual(unrelated(), originalUnrelated);
  });

  await t.test('string-typed absent cache remains the existing empty-value compatibility boundary, never an inferred numeric zero', async () => {
    const before = snapshot();
    const bytes = await statement({ missingCache: ['利润表', 'D7'], cacheResult: '', stringMissingCache: true });
    const preview = (await call('POST', '/finance/statements/import-file/preview', fileForm(bytes))).data;
    assert.equal(preview.ready, true);
    assert.equal(preview.incomeStatement.adminExpensesMonth, null);
    assert.deepEqual(snapshot(), before);
  });

  await t.test('single-file missing/stale previews and unapproved replay are nonmutating; explicit overwrite updates one period', async () => {
    const bytes = await statement({ blank: true });
    const preview = (await call('POST', '/finance/statements/import-file/preview', fileForm(bytes))).data;
    const detail = (await call('GET', '/finance/statements/2026/10')).data;
    assert.equal(preview.period.existing, true);
    const before = snapshot();
    await call('POST', '/finance/statements/import-file/confirm', fileForm(bytes), 409);
    for (const fields of [{ month: 11 }, { periodLabel: 'Changed synthetic label' }, { allowOverwrite: 'TRUE' }]) {
      await call('POST', '/finance/statements/import-file/confirm', fileForm(bytes, { previewId: preview.previewId, ...fields }), 409);
    }
    await call('POST', '/finance/statements/import-file/confirm', fileForm(await statement(), { previewId: preview.previewId, allowOverwrite: true }), 409);
    await call('POST', '/finance/statements/import-file/confirm', fileForm(bytes, { previewId: preview.previewId }), 409);
    assert.deepEqual(snapshot(), before);
    const result = (await call('POST', '/finance/statements/import-file/confirm', fileForm(bytes, { previewId: preview.previewId, allowOverwrite: true }))).data;
    assert.equal(result.overwritten, true);
    const replaced = (await call('GET', '/finance/statements/2026/10')).data;
    assert.equal(replaced.id, detail.id);
    assert.equal(replaced.incomeStatement.revenueMonth, null);
    assert.equal(replaced.incomeStatement.netProfitMonth, 120.15);
    assert.equal(snapshot().financial_periods.filter(row => row.year === 2026 && row.month === 10).length, 1);
    assertStoredAmounts(10, { incomeOverrides: { revenueMonth: null, costOfSalesMonth: null } });
    assert.deepEqual(unrelated(), originalUnrelated);
  });

  await t.test('three real XLSX sources preserve cashflow, ordered evidence rows and exact metadata after confirmed HTTP readback', async () => {
    const sources = await bundle({ formulas: true });
    const before = snapshot();
    const preview = (await call('POST', '/finance/statements/import-bundle/preview', bundleForm(sources))).data;
    assert.equal(preview.ready, true);
    assert.equal(preview.cashFlowStatement.netOperatingCashFlowMonth, 50.25);
    assert.equal(preview.cashFlowStatement.netOperatingCashFlowYTD, 730.75);
    assert.equal(preview.cashFlowStatement.netInvestingCashFlowMonth, 0);
    assert.deepEqual(snapshot(), before);
    const result = (await call('POST', '/finance/statements/import-bundle/confirm', bundleForm(sources, { previewId: preview.previewId }))).data;
    assert.equal(result.imported, 3);
    const detail = (await call('GET', '/finance/statements/2026/12')).data;
    assert.equal(detail.cashFlowStatement.netOperatingCashFlowMonth, 50.25);
    assert.equal(detail.cashFlowStatement.netOperatingCashFlowYTD, 730.75);
    assert.equal(detail.cashFlowStatement.netInvestingCashFlowMonth, 0);
    assertStoredAmounts(12, { cashFlow: true, evidence: true, sources });
    assert.deepEqual(detail.accountBalances.map(row => [row.sourceRow, row.rowType, row.accountCode]), [[5, 'ACCOUNT', '001002'], [6, 'SUBTOTAL', null], [7, 'TOTAL', null]]);
    assert.equal(detail.accountBalances[0].periodDebit, 50.25);
    assert.equal(detail.accountBalances[0].periodCredit, 0);
    assert.deepEqual(detail.generalLedgerEntries.map(row => [row.sourceRow, row.rowType]), [[4, 'OPENING'], [5, 'ENTRY'], [6, 'PERIOD_TOTAL'], [7, 'YTD_TOTAL']]);
    assert.equal(detail.generalLedgerEntries[1].entryDate, '2026-12-10T00:00:00.000Z');
    assert.equal(detail.generalLedgerEntries[1].voucherNumber, 'SYNTHETIC-1');
    assert.equal(detail.generalLedgerEntries[1].debit, 50.25);
    assert.equal(detail.generalLedgerEntries[1].credit, 0);
    assert.equal(detail.generalLedgerEntries[0].voucherNumber, null);
    for (const [key, type, rowCount] of [['statement', 'STATEMENT', 3], ['trialBalance', 'TRIAL_BALANCE', 3], ['generalLedger', 'GENERAL_LEDGER', 4]]) {
      const stored = detail.dataSources.find(row => row.type === type);
      assert.equal(stored.fileName, sources[key].fileName);
      assert.equal(stored.fileSize, sources[key].buffer.length);
      assert.equal(stored.sha256, crypto.createHash('sha256').update(sources[key].buffer).digest('hex'));
      assert.equal(stored.rowCount, rowCount);
    }
    assert.deepEqual((await call('GET', '/finance/statements/2026/12', undefined, 200, 'ADMIN')).data, detail);
    const boss = (await call('GET', '/finance/statements/2026/12', undefined, 200, 'BOSS')).data;
    assert.equal(boss.incomeStatement.revenueMonth, 800.25);
    assert.equal(Object.hasOwn(boss, 'accountBalances'), false);
    assert.equal(Object.hasOwn(boss, 'generalLedgerEntries'), false);
    assert.equal(Object.hasOwn(boss, 'dataSources'), false);
    assert.deepEqual(unrelated(), originalUnrelated);
  });

  await t.test('bundle stale sources, filename and period fail; explicit replacement clears old cashflow without appending evidence', async () => {
    const sources = await bundle({ cashFlow: false, ledgerSummary: '合成替换收款' });
    const preview = (await call('POST', '/finance/statements/import-bundle/preview', bundleForm(sources))).data;
    const detail = (await call('GET', '/finance/statements/2026/12')).data;
    assert.equal(preview.period.existing, true);
    assert.equal(preview.cashFlowStatement, null);
    const before = snapshot();
    await call('POST', '/finance/statements/import-bundle/confirm', bundleForm(sources), 409);
    await call('POST', '/finance/statements/import-bundle/confirm', bundleForm(sources, { previewId: preview.previewId }), 409);
    await call('POST', '/finance/statements/import-bundle/confirm', bundleForm(sources, { previewId: preview.previewId, month: 11, allowOverwrite: true }), 409);
    const renamed = { ...sources, generalLedger: { ...sources.generalLedger, fileName: 'renamed-synthetic.xlsx' } };
    await call('POST', '/finance/statements/import-bundle/confirm', bundleForm(renamed, { previewId: preview.previewId, allowOverwrite: true }), 409);
    await call('POST', '/finance/statements/import-bundle/confirm', bundleForm(await bundle(), { previewId: preview.previewId, allowOverwrite: true }), 409);
    assert.deepEqual(snapshot(), before);
    const result = (await call('POST', '/finance/statements/import-bundle/confirm', bundleForm(sources, { previewId: preview.previewId, allowOverwrite: true }))).data;
    assert.equal(result.overwritten, true);
    const replaced = (await call('GET', '/finance/statements/2026/12')).data;
    assert.equal(replaced.id, detail.id);
    assert.equal(replaced.cashFlowStatement, null);
    assert.equal(replaced.generalLedgerEntries[1].summary, '合成替换收款');
    assert.equal(replaced.generalLedgerEntries.length, 4);
    assert.equal(replaced.accountBalances.length, 3);
    assert.equal(replaced.dataSources.length, 3);
    assert.equal(replaced.dataSources.find(row => row.type === 'STATEMENT').rowCount, 2);
    assert.equal(snapshot().cash_flow_statement_entries.some(row => row.periodId === detail.id), false);
    assertStoredAmounts(12, { evidence: true, sources, statementSheetCount: 2 });
    assert.deepEqual(unrelated(), originalUnrelated);
  });

  await t.test('missing-cache cashflow or invalid source requirements reject previews and confirmations without partial writes', async () => {
    const before = snapshot();
    const missing = await bundle({ missingCache: ['现金流量表', 'D6'] });
    const invalid = await call('POST', '/finance/statements/import-bundle/preview', bundleForm(missing), 400);
    assert.match(invalid.message, /现金流量表.*第6行.*D6.*本月金额.*重新计算.*保存/);
    await call('POST', '/finance/statements/import-bundle/confirm', bundleForm(missing, { previewId: 'synthetic-stale' }), 400);
    const absent = bundleForm(await bundle()); absent.delete('generalLedger');
    await call('POST', '/finance/statements/import-bundle/preview', absent, 400);
    await call('POST', '/finance/statements/import-file/preview', fileForm(Buffer.from('synthetic-not-xlsx')), 400);
    await call('POST', '/finance/statements/import-file/preview', fileForm(await statement({ missingSheet: true })), 400);
    await call('POST', '/finance/statements/import-file/preview', new FormData(), 400);
    for (const options of [{ company: '另一合成公司' }, { trialPeriod: 11 }, { assets: 2000.25 }]) {
      const sources = await bundle(options);
      const preview = (await call('POST', '/finance/statements/import-bundle/preview', bundleForm(sources))).data;
      assert.equal(preview.ready, false);
      await call('POST', '/finance/statements/import-bundle/confirm', bundleForm(sources, { previewId: preview.previewId, allowOverwrite: true }), 400);
    }
    assert.deepEqual(snapshot(), before);
  });

  await t.test('late real SQLite failure rolls back every replacement and the same confirmed request can succeed after repair', async () => {
    const sources = await bundle({ formulas: true, ledgerSummary: '合成回滚后收款' });
    const preview = (await call('POST', '/finance/statements/import-bundle/preview', bundleForm(sources))).data;
    const fields = { previewId: preview.previewId, allowOverwrite: true };
    const before = snapshot();
    await db.$executeRawUnsafe("CREATE TRIGGER synthetic_financial_source_failure BEFORE INSERT ON financial_data_sources BEGIN SELECT RAISE(ABORT, 'synthetic financial source failure'); END");
    try { await call('POST', '/finance/statements/import-bundle/confirm', bundleForm(sources, fields), 500); }
    finally { await db.$executeRawUnsafe('DROP TRIGGER synthetic_financial_source_failure'); }
    assert.deepEqual(snapshot(), before, 'late source insert failure restores amounts, evidence, metadata and timestamps');
    await call('POST', '/finance/statements/import-bundle/confirm', bundleForm(sources, fields));
    const detail = (await call('GET', '/finance/statements/2026/12')).data;
    assert.equal(detail.generalLedgerEntries[1].summary, '合成回滚后收款');
    assert.equal(detail.cashFlowStatement.netOperatingCashFlowMonth, 50.25);
    assert.equal(detail.dataSources.length, 3);
    assertStoredAmounts(12, { cashFlow: true, evidence: true, sources });
  });

  await t.test('all four import routes keep the existing actual role and inactive/anonymous authentication boundaries', async () => {
    const bytes = await statement();
    const sources = await bundle();
    const before = snapshot();
    for (const mode of ['file', 'bundle']) {
      for (const action of ['preview', 'confirm']) {
        for (const role of ['BOSS', 'PURCHASE', 'SALES', 'WAREHOUSE', 'INACTIVE', 'ANONYMOUS']) {
          await call('POST', `/finance/statements/import-${mode}/${action}`, mode === 'file' ? fileForm(bytes) : bundleForm(sources), ['INACTIVE', 'ANONYMOUS'].includes(role) ? 401 : 403, role);
        }
      }
      await call('POST', `/finance/statements/import-${mode}/preview`, mode === 'file' ? fileForm(bytes) : bundleForm(sources), 200, 'ADMIN');
    }
    assert.deepEqual(snapshot(), before);
    assert.deepEqual(unrelated(), originalUnrelated);
    assert.deepEqual((await call('GET', '/finance/statements/2025/12')).data, prior, 'another period remains intact across all imports');
    assert.deepEqual(fs.readdirSync(process.env.UPLOAD_DIR), []);
  });
});
