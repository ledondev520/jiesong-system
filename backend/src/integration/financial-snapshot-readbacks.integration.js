/**
 * Input: actual Express/auth read paths and committed migrations with private synthetic SQLite
 * Output: four bounded statement/evidence/reconciliation/source-discovery readback cases
 * Pos: financial read acceptance; no uploads, providers, production data or accounting writes
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const FIXTURE_TIME = Date.parse('2026-10-05T12:00:00Z');
const DATE_FIELDS = new Set(['reportDate', 'importedAt', 'updatedAt', 'createdAt', 'entryDate', 'matchedAt']);
/**
 * 职责：normalize stored date transport only.
 * @param {object} row SQLite row
 * @returns {object} HTTP-shaped row
 */
// SQLite stores Prisma DateTime values as milliseconds; HTTP exposes ISO dates.
const httpRow = row => Object.fromEntries(Object.entries(row).map(([key, value]) =>
  [key, DATE_FIELDS.has(key) && value !== null ? new Date(value).toISOString() : value]));
/**
 * 职责：compare requested persisted fields.
 * @param {object} row HTTP row
 * @param {string[]} keys columns
 * @returns {object} projection
 */
const project = (row, keys) => Object.fromEntries(keys.map(key => [key, row[key]]));

test('HTTP/SQLite: financial snapshots and reconciliation retain independently stored source facts', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-financial-readbacks-'));
  fs.chmodSync(directory, 0o700);
  const database = path.join(directory, 'synthetic.db');
  process.env.DATABASE_URL = `file:${database}`;
  process.env.UPLOAD_DIR = path.join(directory, 'uploads');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-only-financial-readbacks-never-for-production';
  process.env.TZ = 'UTC';
  const originalUmask = process.umask(0o022);
  let db, server;
  t.after(async () => {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    if (db) await db.$disconnect();
    fs.rmSync(directory, { recursive: true, force: true });
    process.umask(originalUmask);
  });

  // 0. Apply committed migrations to an empty private database, never db push or client generation.
  const migrations = path.resolve(__dirname, '../../prisma/migrations');
  const ddl = fs.readdirSync(migrations).sort()
    .filter(name => fs.statSync(path.join(migrations, name)).isDirectory())
    .map(name => fs.readFileSync(path.join(migrations, name, 'migration.sql'), 'utf8')).join('\n');
  execFileSync('python3', ['-c', 'import sqlite3,sys,os; os.umask(0o077); c=sqlite3.connect(sys.argv[1]); c.executescript(sys.stdin.read()); c.close()', database], { input: ddl });
  fs.chmodSync(database, 0o600);

  // Independent fixture inserts and read-only readbacks do not call the services under test.
  /**
   * 职责：insert synthetic literal fixtures independently.
   * @param {object} tables named rows
   * @returns {Buffer} subprocess output
   */
  const seed = tables => execFileSync('python3', ['-c', `import sqlite3,sys,json
c=sqlite3.connect(sys.argv[1])
c.execute('PRAGMA foreign_keys=ON')
for table,rows in json.load(sys.stdin).items():
  for row in rows:
    columns=list(row)
    c.execute('INSERT INTO "'+table+'" ('+','.join('"'+key+'"' for key in columns)+') VALUES ('+','.join('?' for key in columns)+')',list(row.values()))
c.commit()
c.close()`, database], { input: JSON.stringify(tables), timeout: 10000 });
  /**
   * 职责：read all persisted fields without writes.
   * @returns {object} independent database snapshot
   */
  const snapshot = () => JSON.parse(execFileSync('python3', ['-c', `import sqlite3,sys,json
c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True)
c.row_factory=sqlite3.Row
tables=[row[0] for row in c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
print(json.dumps({table:[dict(row) for row in c.execute('SELECT * FROM "'+table+'" ORDER BY rowid')] for table in tables}))
c.close()`, database], { encoding: 'utf8', timeout: 10000 }));
  db = require('../utils/prisma');
  const jwt = require('jsonwebtoken');
  const tokens = {};
  for (const role of ['ADMIN', 'FINANCE', 'BOSS']) {
    const user = await db.user.create({ data: { username: `synthetic-readback-${role}`, name: `Synthetic ${role}`, password: 'test-only-unused-hash', role } });
    // Real database role decides evidence access, even with a misleading JWT role.
    tokens[role] = jwt.sign({ userId: user.id, role: 'ADMIN' }, process.env.JWT_SECRET);
  }
  const app = require('../app');
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  /**
   * 职责：read an actual authenticated route and verify status.
   * @param {string} route path
   * @param {object} filters query
   * @param {string} role user
   * @param {number} expected status
   * @returns {Promise<object>} response data
   */
  const get = async (route, filters = {}, role = 'FINANCE', expected = 200) => {
    const response = await fetch(`${base}${route}?${new URLSearchParams(filters)}`, {
      headers: tokens[role] ? { authorization: `Bearer ${tokens[role]}` } : {},
    });
    const body = await response.json();
    assert.equal(response.status, expected, `${role} GET ${route}: ${body.message || ''}`);
    return body.data;
  };

  await t.test('stored monthly and YTD snapshots cross years in numeric order and repeated reads do not mutate them', async () => {
    // Insert out of order, including month 2 versus 12. YTD is deliberately not a running sum.
    seed({
      financial_periods: [
        { id: 'period-latest', year: 2026, month: 10, periodLabel: 'Synthetic 2026-10', reportDate: Date.parse('2026-10-31T00:00:00Z'), importedAt: FIXTURE_TIME, updatedAt: FIXTURE_TIME },
        { id: 'period-december', year: 2025, month: 12, periodLabel: 'Synthetic 2025-12', reportDate: Date.parse('2025-12-31T00:00:00Z'), importedAt: FIXTURE_TIME, updatedAt: FIXTURE_TIME },
        { id: 'period-february', year: 2025, month: 2, periodLabel: 'Synthetic 2025-02', reportDate: Date.parse('2025-02-28T00:00:00Z'), importedAt: FIXTURE_TIME, updatedAt: FIXTURE_TIME },
        { id: 'period-january', year: 2026, month: 1, periodLabel: 'Synthetic 2026-01', reportDate: Date.parse('2026-01-31T00:00:00Z'), importedAt: FIXTURE_TIME, updatedAt: FIXTURE_TIME },
      ],
      balance_sheet_entries: [
        { id: 'balance-february', periodId: 'period-february', totalAssets: 100000, totalLiabilities: 30000, totalEquity: 70000, cashAndEquivalents: 50000 },
        { id: 'balance-december', periodId: 'period-december', totalAssets: 150000, totalLiabilities: 60000, totalEquity: 90000, cashAndEquivalents: 70000 },
        { id: 'balance-january', periodId: 'period-january', totalAssets: 200000, totalLiabilities: 100000, totalEquity: 100000, cashAndEquivalents: 80000 },
        { id: 'balance-latest', periodId: 'period-latest', totalAssets: 240000, totalLiabilities: 60000, totalEquity: 180000, cashAndEquivalents: 90000, inventory: 0, accountsReceivable: null, retainedEarnings: -125 },
      ],
      income_statement_entries: [
        { id: 'income-february', periodId: 'period-february', revenueMonth: 1000, revenueYTD: 17000, netProfitMonth: 100, netProfitYTD: 3300 },
        { id: 'income-december', periodId: 'period-december', revenueMonth: 5000, revenueYTD: 89000, netProfitMonth: 200, netProfitYTD: 8500 },
        { id: 'income-january', periodId: 'period-january', revenueMonth: 20000, revenueYTD: 24000, netProfitMonth: -500, netProfitYTD: 250 },
        { id: 'income-latest', periodId: 'period-latest', revenueMonth: 12000, revenueYTD: 345678, costOfSalesMonth: 6000, costOfSalesYTD: 77777, adminExpensesMonth: 1200, adminExpensesYTD: 9000, financialExpensesMonth: 100, financialExpensesYTD: -300, sellingExpensesMonth: 700, sellingExpensesYTD: 4000, taxesMonth: 900, taxesYTD: 1900, operatingProfitMonth: 0, operatingProfitYTD: null, netProfitMonth: -200, netProfitYTD: 12345 },
      ],
      cash_flow_statement_entries: [
        { id: 'cash-december', periodId: 'period-december', salesCashMonth: 4000, salesCashYTD: 98765, netOperatingCashFlowMonth: -450, netOperatingCashFlowYTD: 5555 },
        { id: 'cash-latest', periodId: 'period-latest', salesCashMonth: 8000, salesCashYTD: 87654, purchaseCashPaidMonth: 0, purchaseCashPaidYTD: 2222, employeeCashPaidMonth: null, employeeCashPaidYTD: -12, netOperatingCashFlowMonth: -100, netOperatingCashFlowYTD: 3210, endingCashMonth: 91000, endingCashYTD: 92000 },
      ],
      payments: [{ id: 'unrelated-payment', type: 'RECEIVABLE', amount: 900000, currency: 'USD', paymentDate: FIXTURE_TIME, createdAt: FIXTURE_TIME, updatedAt: FIXTURE_TIME }],
      finance_data_batches: [{ id: 'unrelated-bank-batch', type: 'BANK_FLOW', fileName: 'synthetic-unrelated-bank.csv', recordCount: 1, importedAt: FIXTURE_TIME }],
      bank_transactions: [{ id: 'unrelated-bank', batchId: 'unrelated-bank-batch', currency: 'CNY', txnTime: '2026-10-05 12:00:00', txnDate: '2026-10-05', direction: 'IN', amount: 777777, counterpart: '', balance: 999999, createdAt: FIXTURE_TIME }],
    });
    const before = snapshot();
    const list = await get('/finance/statements');
    assert.deepEqual(list.map(row => [row.id, row.year, row.month]), [
      ['period-february', 2025, 2], ['period-december', 2025, 12], ['period-january', 2026, 1], ['period-latest', 2026, 10],
    ]);
    assert.deepEqual(list.map(row => [row.incomeStatement.revenueMonth, row.incomeStatement.revenueYTD, row.incomeStatement.netProfitMonth, row.incomeStatement.netProfitYTD]), [
      [1000, 17000, 100, 3300], [5000, 89000, 200, 8500], [20000, 24000, -500, 250], [12000, 345678, -200, 12345],
    ]);
    assert.deepEqual(list[3].balanceSheet, { totalAssets: 240000, totalLiabilities: 60000, totalEquity: 180000, cashAndEquivalents: 90000 });
    const analytics = await get('/finance/statements/analytics');
    assert.equal(analytics.totalPeriods, 4);
    assert.deepEqual(analytics.trends.map(row => [row.year, row.month, row.revenue, row.netProfit]), [
      [2025, 2, 1000, 100], [2025, 12, 5000, 200], [2026, 1, 20000, -500], [2026, 10, 12000, -200],
    ]);
    assert.deepEqual(analytics.trends[3], { label: '2026年10月', month: 10, year: 2026, revenue: 12000, costOfSales: 6000, adminExpenses: 1200, financialExpenses: 100, sellingExpenses: 700, operatingProfit: 0, netProfit: -200, totalAssets: 240000, totalLiabilities: 60000, totalEquity: 180000, cash: 90000, debtRatio: 0.25 });
    assert.equal(analytics.latestPeriod.periodLabel, 'Synthetic 2026-10');
    assert.deepEqual(analytics.latestPeriod.balanceSheet, httpRow(before.balance_sheet_entries.find(row => row.id === 'balance-latest')));
    assert.deepEqual(analytics.latestPeriod.incomeStatement, httpRow(before.income_statement_entries.find(row => row.id === 'income-latest')));
    assert.deepEqual(analytics.alerts.map(row => row.code).sort(), ['CONSECUTIVE_LOSS', 'REVENUE_DECLINE']);
    // Raw amounts remain CNY report snapshots. The UI alone scales display to 万;
    // its recent cost uses these four trends (8000), while preview also includes taxes (8900).
    for (const [year, month, id] of [[2025, 2, 'period-february'], [2025, 12, 'period-december'], [2026, 1, 'period-january'], [2026, 10, 'period-latest']]) {
      const detail = await get(`/finance/statements/${year}/${month}`);
      assert.deepEqual(project(detail, Object.keys(before.financial_periods[0])), httpRow(before.financial_periods.find(row => row.id === id)));
      assert.deepEqual(detail.balanceSheet, httpRow(before.balance_sheet_entries.find(row => row.periodId === id)));
      assert.deepEqual(detail.incomeStatement, httpRow(before.income_statement_entries.find(row => row.periodId === id)));
      const cash = before.cash_flow_statement_entries.find(row => row.periodId === id);
      assert.deepEqual(detail.cashFlowStatement, cash ? httpRow(cash) : null);
      assert.deepEqual(detail.accountBalances, []);
      assert.deepEqual(detail.generalLedgerEntries, []);
      assert.deepEqual(detail.dataSources, []);
    }
    assert.deepEqual(await get('/finance/statements'), list);
    assert.deepEqual(await get('/finance/statements/analytics'), analytics);
    assert.deepEqual(snapshot(), before, 'statement reads must not rewrite snapshots, unrelated payments or bank values');
  });

  await t.test('evidence keeps source order, nulls, zeros, negatives and summary rows within its period and current roles', async () => {
    seed({
      account_balance_entries: [
        { id: 'account-total', periodId: 'period-latest', sourceRow: 9, rowType: 'TOTAL', accountCode: null, accountName: 'Synthetic Total', endingDebit: 999999, endingCredit: 999999 },
        { id: 'account-null-zero-negative', periodId: 'period-latest', sourceRow: 5, rowType: 'ACCOUNT', accountCode: 'SYN-1001', accountName: 'Synthetic Cash', openingDebit: null, openingCredit: 0, periodDebit: -25, periodCredit: 10, yearDebit: 75, yearCredit: null, endingDebit: 0, endingCredit: -15 },
        { id: 'account-subtotal', periodId: 'period-latest', sourceRow: 7, rowType: 'SUBTOTAL', accountCode: null, accountName: 'Synthetic Subtotal', openingDebit: 123, openingCredit: 123, periodDebit: 456, periodCredit: 456 },
        { id: 'account-january', periodId: 'period-january', sourceRow: 5, rowType: 'ACCOUNT', accountCode: 'SYN-1001', accountName: 'Synthetic Prior Cash', endingDebit: 888888 },
      ],
      general_ledger_entries: [
        { id: 'ledger-ytd', periodId: 'period-latest', sourceRow: 10, rowType: 'YTD_TOTAL', accountCode: 'SYN-1001', accountName: 'Synthetic Cash', entryDate: null, voucherNumber: null, summary: '本年累计', debit: 999999, credit: 999999, direction: null, balance: 0 },
        { id: 'ledger-entry', periodId: 'period-latest', sourceRow: 5, rowType: 'ENTRY', accountCode: 'SYN-1001', accountName: 'Synthetic Cash', entryDate: Date.parse('2026-10-03T00:00:00Z'), voucherNumber: 'SYNTHETIC-VOUCHER-01', summary: 'Synthetic adjustment', debit: -25, credit: 0, direction: '借', balance: -15 },
        { id: 'ledger-opening', periodId: 'period-latest', sourceRow: 4, rowType: 'OPENING', accountCode: 'SYN-1001', accountName: 'Synthetic Cash', entryDate: null, voucherNumber: null, summary: '期初余额', debit: null, credit: null, direction: '借', balance: 10 },
        { id: 'ledger-period', periodId: 'period-latest', sourceRow: 8, rowType: 'PERIOD_TOTAL', accountCode: 'SYN-1001', accountName: 'Synthetic Cash', entryDate: null, voucherNumber: null, summary: '本期合计', debit: -25, credit: 0, direction: null, balance: null },
        { id: 'ledger-january', periodId: 'period-january', sourceRow: 5, rowType: 'ENTRY', accountCode: 'SYN-1001', accountName: 'Synthetic Prior Cash', summary: 'Synthetic prior entry', debit: 888888 },
      ],
      financial_data_sources: [
        { id: 'source-trial', periodId: 'period-latest', type: 'TRIAL_BALANCE', fileName: 'synthetic-trial-balance.xls', fileSize: 123, sha256: 'a'.repeat(64), sheetName: 'Synthetic Trial Balance', rowCount: 3, importedAt: FIXTURE_TIME },
        { id: 'source-statement', periodId: 'period-latest', type: 'STATEMENT', fileName: 'synthetic-statement.xlsx', fileSize: 234, sha256: 'b'.repeat(64), sheetName: 'Synthetic Statement Sheets', rowCount: 3, importedAt: FIXTURE_TIME },
        { id: 'source-ledger', periodId: 'period-latest', type: 'GENERAL_LEDGER', fileName: 'synthetic-general-ledger.xlsx', fileSize: 345, sha256: 'c'.repeat(64), sheetName: 'Synthetic General Ledger', rowCount: 4, importedAt: FIXTURE_TIME },
        { id: 'source-january', periodId: 'period-january', type: 'STATEMENT', fileName: 'synthetic-prior-statement.xlsx', fileSize: 456, sha256: 'd'.repeat(64), sheetName: 'Synthetic Prior Statement', rowCount: 2, importedAt: FIXTURE_TIME },
      ],
    });
    const before = snapshot();
    const detail = await get('/finance/statements/2026/10');
    assert.deepEqual(detail.accountBalances.map(row => row.id), ['account-null-zero-negative', 'account-subtotal', 'account-total']);
    assert.deepEqual(detail.generalLedgerEntries.map(row => row.id), ['ledger-opening', 'ledger-entry', 'ledger-period', 'ledger-ytd']);
    assert.deepEqual(detail.dataSources.map(row => row.id), ['source-ledger', 'source-statement', 'source-trial']);
    for (const [field, table] of [['accountBalances', 'account_balance_entries'], ['generalLedgerEntries', 'general_ledger_entries'], ['dataSources', 'financial_data_sources']]) {
      for (const row of detail[field]) assert.deepEqual(row, httpRow(before[table].find(stored => stored.id === row.id)));
      assert.ok(detail[field].every(row => row.periodId === 'period-latest'));
    }
    assert.deepEqual(await get('/finance/statements/2026/10', {}, 'ADMIN'), detail);
    assert.deepEqual(await get('/finance/statements/2026/10'), detail);
    const prior = await get('/finance/statements/2026/1');
    assert.equal(prior.cashFlowStatement, null, 'an absent cash-flow snapshot stays absent');
    assert.deepEqual(prior.accountBalances.map(row => row.id), ['account-january']);
    assert.deepEqual(prior.generalLedgerEntries.map(row => row.id), ['ledger-january']);
    assert.deepEqual(prior.dataSources.map(row => row.id), ['source-january']);
    const boss = await get('/finance/statements/2026/10', {}, 'BOSS');
    for (const field of ['accountBalances', 'generalLedgerEntries', 'dataSources']) {
      assert.equal(Object.hasOwn(boss, field), false, `BOSS must omit ${field}`);
    }
    assert.deepEqual(boss, Object.fromEntries(Object.entries(detail).filter(([key]) => !['accountBalances', 'generalLedgerEntries', 'dataSources'].includes(key))));
    for (const route of ['/finance/statements/evidence/summary', '/finance/statements/evidence/documents']) {
      await get(route);
      await get(route, {}, 'BOSS', 403);
    }
    await get('/finance/statements/2027/3', {}, 'FINANCE', 404);
    await get('/finance/statements/2027/3', {}, 'BOSS', 404);
    await get('/finance/statements/2026/10', {}, 'ANONYMOUS', 401);
    // Summary rows are retained as evidence and never added to the stored statement amounts.
    const analytics = await get('/finance/statements/analytics', {}, 'BOSS');
    assert.equal(analytics.trends[3].revenue, 12000);
    assert.equal(analytics.trends[3].cash, 90000);
    assert.equal(analytics.latestPeriod.incomeStatement.revenueYTD, 345678);
    assert.deepEqual(snapshot(), before, 'evidence, missing-period and role reads must not alter any stored fields');
  });

  let reconciliation;
  await t.test('lifetime CNY supplier differences, inclusive normal boundaries and grouped totals exclude currency and invalid-invoice decoys', async () => {
    const supplier = await db.supplier.create({ data: { id: 'synthetic-source-supplier', name: 'Synthetic Source Supplier' } });
    const contract = await db.purchaseContract.create({ data: { id: 'synthetic-source-contract', contractNo: 'CG-SYNTHETIC-SOURCE-READ', supplierId: supplier.id, totalAmount: 123456, status: 'SIGNED' } });
    /**
     * 职责：construct a canonical synthetic bank source.
     * @param {string} id source ID
     * @param {string|null} counterpart synthetic name
     * @param {number} amount signed amount
     * @param {string} direction IN or OUT
     * @param {object} fields source overrides
     * @returns {object} synthetic bank row
     */
    const bank = (id, counterpart, amount, direction = 'OUT', fields = {}) => ({
      id, batchId: 'bank-current', bankName: 'Synthetic Bank', accountNoMasked: '****0001', currency: 'CNY',
      txnTime: '2026-10-01 12:00:00', txnDate: '2026-10-01', amount, counterpart, direction,
      summary: 'Synthetic fixture', txnId: `SYNTHETIC-${id}`, balance: 1234567, createdAt: FIXTURE_TIME, ...fields,
    });
    /**
     * 职责：construct a synthetic invoice source.
     * @param {string} id source ID
     * @param {string} seller synthetic name
     * @param {number} total tax-inclusive amount
     * @param {number} tax tax amount
     * @param {object} fields classification overrides
     * @returns {object} synthetic invoice row
     */
    const invoice = (id, seller, total, tax, fields = {}) => ({
      id, batchId: 'invoice-current', invNo: `SYNTHETIC-${id}`, invDate: '2026-10-01', seller,
      buyer: 'Synthetic Buyer', itemName: 'Synthetic Widget', amount: total - tax, tax, total,
      status: '正常', isPositive: '是', createdAt: FIXTURE_TIME, ...fields,
    });
    seed({
      finance_data_batches: [
        { id: 'bank-historical', type: 'BANK_FLOW', fileName: 'synthetic-bank-history.csv', recordCount: 1, dataStartDate: '2024-12-31', dataEndDate: '2024-12-31', note: 'Synthetic lifetime source', importedAt: FIXTURE_TIME - 1000 },
        { id: 'bank-current', type: 'BANK_FLOW', fileName: 'synthetic-bank-current.csv', recordCount: 18, dataStartDate: '2026-10-01', dataEndDate: '2026-10-04', note: 'Synthetic current source', importedAt: FIXTURE_TIME },
        { id: 'invoice-historical', type: 'INVOICE', fileName: 'synthetic-invoice-history.xlsx', recordCount: 1, dataStartDate: '2024-12-31', dataEndDate: '2024-12-31', note: 'Synthetic lifetime source', importedAt: FIXTURE_TIME - 1000 },
        { id: 'invoice-current', type: 'INVOICE', fileName: 'synthetic-invoice-current.xlsx', recordCount: 9, dataStartDate: '2026-10-01', dataEndDate: '2026-10-06', note: 'Synthetic current source', importedAt: FIXTURE_TIME },
      ],
      bank_transactions: [
        bank('bank-under-old', '  Synthetic Under & Co  ', -1000, 'OUT', { batchId: 'bank-historical', txnTime: '2024-12-31 12:00:00', txnDate: '2024-12-31', matchStatus: 'MATCHED', matchedContractId: contract.id, matchedContractType: 'PURCHASE', matchScore: 88, matchedAt: FIXTURE_TIME }),
        bank('bank-under-new', 'Synthetic Under & Co', -200, 'OUT', { matchStatus: 'IGNORED' }),
        bank('bank-under-refund', 'Synthetic Under & Co', 100, 'IN', { txnTime: '2026-10-02 12:00:00', txnDate: '2026-10-02' }),
        // Overlapping names may appear in linked discovery, without joining this payment group.
        bank('bank-under-annex', 'Synthetic Under & Co Annex', 7, 'IN', { txnTime: '2026-10-03 12:00:00', txnDate: '2026-10-03' }),
        bank('bank-under-usd', 'Synthetic Under & Co', -9000, 'OUT', { currency: 'USD', accountNoMasked: '****0002', txnTime: '2026-10-04 12:00:00', txnDate: '2026-10-04' }),
        bank('bank-over-out', 'Synthetic Over（West）', -500),
        bank('bank-over-refund', 'Synthetic Over（West）', 50, 'IN', { txnTime: '2026-10-02 13:00:00', txnDate: '2026-10-02' }),
        bank('bank-plus', 'Synthetic Plus Boundary', -1000),
        bank('bank-minus', 'Synthetic Minus Boundary', -800),
        bank('bank-exact', 'Synthetic Exact', -300),
        bank('bank-orphan', 'Synthetic Missing Receipt', -250),
        bank('bank-one-out', 'Synthetic At Threshold', -50),
        bank('bank-one-in', 'Synthetic At Threshold', 49, 'IN'),
        bank('bank-small-out', 'Synthetic Below Threshold', -20),
        bank('bank-small-in', 'Synthetic Below Threshold', 19.5, 'IN'),
        bank('bank-incoming', 'Synthetic Incoming Only', 10, 'IN'),
        bank('bank-usd-only', 'Synthetic USD Only', -99000, 'OUT', { currency: 'USD' }),
        bank('bank-blank', '   ', -88888),
        bank('bank-null', null, -77777),
      ],
      invoice_records: [
        invoice('invoice-under-old', ' Synthetic Under & Co ', 400, 40, { batchId: 'invoice-historical', invDate: '2024-12-31', matchStatus: 'MATCHED', matchedContractId: contract.id, matchedContractType: 'PURCHASE', matchScore: 77, matchedAt: FIXTURE_TIME }),
        invoice('invoice-under-new', 'Synthetic Under & Co', 300, 30, { invDate: '2026-10-02', matchStatus: 'IGNORED' }),
        invoice('invoice-under-reversed', 'Synthetic Under & Co', 900, 90, { invDate: '2026-10-03', status: '已红冲-全额' }),
        invoice('invoice-under-negative', 'Synthetic Under & Co', -80, -8, { invDate: '2026-10-04', isPositive: '否' }),
        invoice('invoice-under-annex', 'Synthetic Under & Co Annex', 50, 5, { invDate: '2026-10-05' }),
        invoice('invoice-over', 'Synthetic Over(West)', 650, 65),
        invoice('invoice-plus', 'Synthetic Plus Boundary', 900, 90),
        invoice('invoice-minus', 'Synthetic Minus Boundary', 900, 90),
        invoice('invoice-exact', 'Synthetic Exact', 300, 30),
        invoice('invoice-orphan', 'Synthetic Invoice Alone', 220, 22, { invDate: '2026-10-06' }),
      ],
    });
    const before = snapshot();
    reconciliation = await get('/bank-flow/reconciliation/full');
    assert.deepEqual(reconciliation.summary, {
      matchedCount: 5, normalCount: 3, underInvoicedCount: 1, underInvoicedGap: 400,
      overInvoicedCount: 1, overInvoicedGap: 200, unmatchedPaymentCount: 1,
      unmatchedPaymentTotal: 250, unmatchedInvoiceCount: 2, unmatchedInvoiceTotal: 270,
    });
    assert.deepEqual(Object.fromEntries(reconciliation.matched.map(row => [row.payName, row])), {
      'Synthetic Under & Co': { payName: 'Synthetic Under & Co', netPaid: 1100, totalInvoice: 700, totalTax: 70, gap: 400, gapPct: 36.4, category: 'under_invoiced', txnCount: 3, invCount: 2 },
      'Synthetic Over（West）': { payName: 'Synthetic Over（West）', invName: 'Synthetic Over(West)', netPaid: 450, totalInvoice: 650, totalTax: 65, gap: -200, gapPct: -44.4, category: 'over_invoiced', txnCount: 2, invCount: 1 },
      'Synthetic Plus Boundary': { payName: 'Synthetic Plus Boundary', netPaid: 1000, totalInvoice: 900, totalTax: 90, gap: 100, gapPct: 10, category: 'normal', txnCount: 1, invCount: 1 },
      'Synthetic Minus Boundary': { payName: 'Synthetic Minus Boundary', netPaid: 800, totalInvoice: 900, totalTax: 90, gap: -100, gapPct: -12.5, category: 'normal', txnCount: 1, invCount: 1 },
      'Synthetic Exact': { payName: 'Synthetic Exact', netPaid: 300, totalInvoice: 300, totalTax: 30, gap: 0, gapPct: 0, category: 'normal', txnCount: 1, invCount: 1 },
    });
    assert.deepEqual(reconciliation.matched.map(row => Math.abs(row.gap)), [400, 200, 100, 100, 0]);
    assert.deepEqual(reconciliation.unmatchedPayments, [{ counterpart: 'Synthetic Missing Receipt', netPaid: 250, txnCount: 1 }]);
    assert.deepEqual(reconciliation.unmatchedInvoices, [
      { seller: 'Synthetic Invoice Alone', totalInvoice: 220, invCount: 1 },
      { seller: 'Synthetic Under & Co Annex', totalInvoice: 50, invCount: 1 },
    ]);
    assert.deepEqual(await get('/bank-flow/reconciliation/full'), reconciliation);
    assert.deepEqual(await get('/bank-flow/reconciliation/full', {}, 'BOSS'), reconciliation);
    assert.deepEqual(snapshot(), before, 'full reconciliation must not relink sources or modify report/contract/payment amounts');
  });
  await t.test('current linked search values read source IDs, batch metadata and classifications without changing MATCHED or IGNORED links', async () => {
    const before = snapshot();
    const under = reconciliation.matched.find(row => row.payName === 'Synthetic Under & Co');
    const over = reconciliation.matched.find(row => row.payName === 'Synthetic Over（West）');
    assert.equal(under.invName, undefined, 'same-name invoices use the current payName fallback');
    assert.equal(over.invName, 'Synthetic Over(West)', 'different normalized spelling uses invName');
    // These are exactly the current UI link search values. They discover source records;
    // contains search is not guaranteed to identify only the full-reconciliation group.
    /**
     * 职责：follow current search destinations without stricter lineage rules.
     * @param {object} row reconciliation group
     * @param {string} role user
     * @returns {Promise<object>} lists and statistics
     */
    const linked = async (row, role = 'FINANCE') => {
      const bankSearch = { search: row.payName };
      const invoiceSearch = { search: row.invName || row.payName };
      return {
        bank: await get('/bank-flow/transactions', { ...bankSearch, pageSize: 500 }, role),
        bankStats: await get('/bank-flow/transactions/stats', bankSearch, role),
        invoices: await get('/bank-flow/invoices', { ...invoiceSearch, pageSize: 500 }, role),
        invoiceStats: await get('/bank-flow/invoices/stats', invoiceSearch, role),
      };
    };
    const underSources = await linked(under);
    assert.deepEqual(underSources.bank.items.map(row => row.id), ['bank-under-annex', 'bank-under-refund', 'bank-under-new', 'bank-under-old']);
    assert.deepEqual(underSources.bank.pagination, { page: 1, pageSize: 500, total: 4, totalPages: 1 });
    assert.deepEqual(underSources.bankStats, { totalIn: 107, totalOut: 1200, netFlow: -1093, txnCount: 4, currency: 'CNY' });
    assert.deepEqual(underSources.invoices.items.map(row => row.id), ['invoice-under-annex', 'invoice-under-negative', 'invoice-under-reversed', 'invoice-under-new', 'invoice-under-old']);
    assert.equal(underSources.invoices.pagination.total, 5);
    assert.deepEqual(underSources.invoiceStats, { validTotal: 750, validTax: 75, validAmount: 675, validCount: 3, reversedCount: 1, totalCount: 5 });
    const overSources = await linked(over);
    assert.deepEqual(overSources.bank.items.map(row => row.id), ['bank-over-refund', 'bank-over-out']);
    assert.deepEqual(overSources.bankStats, { totalIn: 50, totalOut: 500, netFlow: -450, txnCount: 2, currency: 'CNY' });
    assert.deepEqual(overSources.invoices.items.map(row => row.id), ['invoice-over']);
    assert.deepEqual(overSources.invoiceStats, { validTotal: 650, validTax: 65, validAmount: 585, validCount: 1, reversedCount: 0, totalCount: 1 });
    assert.equal(over.netPaid, 450);
    assert.equal(over.totalInvoice, 650);
    assert.equal(over.gap, -200);
    for (const source of [underSources, overSources]) {
      for (const [list, table] of [[source.bank, 'bank_transactions'], [source.invoices, 'invoice_records']]) {
        for (const row of list.items) {
          const stored = before[table].find(value => value.id === row.id);
          assert.deepEqual(project(row, Object.keys(stored)), httpRow(stored), 'source record matches independent stored fields');
          const batch = before.finance_data_batches.find(value => value.id === stored.batchId);
          assert.deepEqual(row.batch, { fileName: batch.fileName, importedAt: new Date(batch.importedAt).toISOString() });
        }
      }
    }
    // Default bank link is CNY. USD only appears after explicitly choosing that currency.
    const usd = await get('/bank-flow/transactions', { search: under.payName, currency: 'USD' });
    assert.deepEqual(usd.items.map(row => row.id), ['bank-under-usd']);
    assert.deepEqual(await get('/bank-flow/transactions/stats', { search: under.payName, currency: 'USD' }), { totalIn: 0, totalOut: 9000, netFlow: -9000, txnCount: 1, currency: 'USD' });
    const bankPage = await get('/bank-flow/transactions', { search: under.payName, page: 2, pageSize: 2 });
    assert.deepEqual(bankPage.items.map(row => row.id), ['bank-under-new', 'bank-under-old']);
    assert.deepEqual(bankPage.pagination, { page: 2, pageSize: 2, total: 4, totalPages: 2 });
    const invoicePage = await get('/bank-flow/invoices', { search: under.invName || under.payName, page: 3, pageSize: 2 });
    assert.deepEqual(invoicePage.items.map(row => row.id), ['invoice-under-old']);
    assert.deepEqual(invoicePage.pagination, { page: 3, pageSize: 2, total: 5, totalPages: 3 });
    assert.deepEqual(await get('/bank-flow/transactions/stats', { search: under.payName, batchId: 'bank-current' }), { totalIn: 107, totalOut: 200, netFlow: -93, txnCount: 3, currency: 'CNY' });
    assert.deepEqual(await get('/bank-flow/invoices/stats', { search: under.payName, batchId: 'invoice-current' }), { validTotal: 350, validTax: 35, validAmount: 315, validCount: 2, reversedCount: 1, totalCount: 4 });
    const batches = await get('/bank-flow/batches');
    const counts = {
      'unrelated-bank-batch': { bankTransactions: 1, invoiceRecords: 0 },
      'bank-historical': { bankTransactions: 1, invoiceRecords: 0 },
      'bank-current': { bankTransactions: 18, invoiceRecords: 0 },
      'invoice-historical': { bankTransactions: 0, invoiceRecords: 1 },
      'invoice-current': { bankTransactions: 0, invoiceRecords: 9 },
    };
    assert.equal(batches.length, 5);
    for (const row of batches) {
      const stored = before.finance_data_batches.find(value => value.id === row.id);
      assert.deepEqual(project(row, Object.keys(stored)), httpRow(stored));
      assert.deepEqual(row._count, counts[row.id]);
    }
    assert.deepEqual(await linked(under), underSources);
    assert.deepEqual(await linked(under, 'BOSS'), underSources);
    assert.deepEqual(await linked(over, 'BOSS'), overSources);
    assert.deepEqual(await get('/bank-flow/reconciliation/full'), reconciliation);
    const after = snapshot();
    for (const table of ['bank_transactions', 'invoice_records']) {
      for (const id of table === 'bank_transactions' ? ['bank-under-old', 'bank-under-new'] : ['invoice-under-old', 'invoice-under-new']) {
        const old = before[table].find(row => row.id === id);
        assert.deepEqual(after[table].find(row => row.id === id), old, `${id} keeps source and confirmed/ignored linkage fields`);
      }
    }
    assert.deepEqual(after, before, 'linked discovery must not change sources, batch metadata, contracts, payments or accounting evidence');
  });

  assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
  assert.equal(fs.statSync(database).mode & 0o777, 0o600);
});
