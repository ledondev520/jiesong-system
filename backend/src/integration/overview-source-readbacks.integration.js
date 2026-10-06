/**
 * Input: actual Express read routes and committed migrations with private synthetic SQLite
 * Output: three source-backed shipping margin/cash, current finance and payment-trend read cases
 * Pos: ordinary overview acceptance; no uploads, production data, providers or business writes
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const NOW = Date.parse('2026-10-06T12:00:00Z');
const PAYMENT_DATE = Date.parse('2026-10-01T12:00:00Z');
const ROLES = ['ADMIN', 'FINANCE', 'BOSS', 'SALES', 'PURCHASE', 'WAREHOUSE'];
// Requires Node 20+ Date mock timers, Python 3 sqlite3 and the existing installed Prisma client.

/**
 * 职责：project stored or HTTP fields without deriving business expectations.
 * @param {object} row source row
 * @param {string[]} fields requested columns
 * @returns {object} selected literal fields
 */
const project = (row, fields) => Object.fromEntries(fields.map(field => [field, row[field]]));

test('HTTP/SQLite: ordinary overviews retain independent source facts without writes', async t => {
  // 0. Pin Date only, leaving the actual HTTP server and limiter timers active.
  const environmentKeys = ['DATABASE_URL', 'UPLOAD_DIR', 'NODE_ENV', 'JWT_SECRET', 'TZ'];
  const previousEnvironment = Object.fromEntries(environmentKeys.map(key => [key, process.env[key]]));
  const previousUmask = process.umask(0o077);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-overview-readbacks-'));
  fs.chmodSync(directory, 0o700);
  const database = path.join(directory, 'synthetic.db');
  process.env.DATABASE_URL = `file:${database}`;
  process.env.UPLOAD_DIR = path.join(directory, 'uploads');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-only-overview-readbacks-never-for-production';
  process.env.TZ = 'UTC';
  t.mock.timers.enable({ apis: ['Date'], now: NOW });
  let db, server;
  t.after(async () => {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    if (db) await db.$disconnect();
    t.mock.timers.reset();
    fs.rmSync(directory, { recursive: true, force: true });
    process.umask(previousUmask);
    for (const key of environmentKeys) {
      if (previousEnvironment[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnvironment[key];
    }
  });

  // 1. Apply committed SQL to an empty private database, never db push or generate.
  const migrations = path.resolve(__dirname, '../../prisma/migrations');
  const ddl = fs.readdirSync(migrations).sort()
    .filter(name => fs.statSync(path.join(migrations, name)).isDirectory())
    .map(name => fs.readFileSync(path.join(migrations, name, 'migration.sql'), 'utf8')).join('\n');
  execFileSync('python3', ['-c', 'import sqlite3,sys,os; os.umask(0o077); c=sqlite3.connect(sys.argv[1]); c.executescript(sys.stdin.read()); c.close()', database], { input: ddl, timeout: 10000 });
  fs.chmodSync(database, 0o600);

  /**
   * 职责：insert only synthetic literal rows independently of product services.
   * @param {object} tables named arrays of rows
   * @returns {Buffer} subprocess output; throws on SQL/foreign-key failure
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
   * 职责：read every persisted table and field through an independent read-only connection.
   * @returns {object} complete database snapshot; throws if the read fails
   */
  const snapshot = () => JSON.parse(execFileSync('python3', ['-c', `import sqlite3,sys,json
c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True)
c.row_factory=sqlite3.Row
tables=[row[0] for row in c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
print(json.dumps({table:[dict(row) for row in c.execute('SELECT * FROM "'+table+'" ORDER BY rowid')] for table in tables}))
c.close()`, database], { encoding: 'utf8', timeout: 10000 }));

  // 2. Literal source facts distinguish formal/derived ownership and header/payment receipts.
  const sales = [
    { id: 'sale-derived', contractNo: 'EXP260001', totalAmount: 100, amountSource: 'DERIVED', receivedAmount: 50, exchangeRate: 7, status: 'SHIPPED', shippedAt: Date.parse('2026-09-30T16:00:00Z') },
    { id: 'sale-formal', contractNo: 'EXP260002', totalAmount: 60, amountSource: 'FORMAL_DOCUMENT', receivedAmount: 30, exchangeRate: 8, status: 'ARRIVED', shippedAt: Date.parse('2026-10-01T15:59:59.999Z') },
    { id: 'sale-next-day', contractNo: 'EXP260003', totalAmount: 10, amountSource: 'DERIVED', receivedAmount: 0, exchangeRate: 9, status: 'SHIPPED', shippedAt: Date.parse('2026-10-01T16:00:00Z') },
    { id: 'sale-draft', contractNo: 'EXP260004', totalAmount: 20, amountSource: 'DERIVED', receivedAmount: 0, exchangeRate: 7, status: 'DRAFT', shippedAt: null },
    { id: 'sale-cancelled', contractNo: 'EXP269999', totalAmount: 9000, amountSource: 'DERIVED', receivedAmount: 8000, exchangeRate: 7, status: 'CANCELLED', shippedAt: PAYMENT_DATE },
  ];
  const purchases = [
    { id: 'purchase-current', contractNo: 'CG260001', supplierId: 'supplier-source', totalAmount: 1000, paidAmount: 200, status: 'SIGNED', expectedDate: Date.parse('2026-09-01T00:00:00Z') },
    { id: 'purchase-cancelled', contractNo: 'CG269999', supplierId: 'supplier-source', totalAmount: 9999, paidAmount: 1111, status: 'CANCELLED', expectedDate: Date.parse('2026-09-01T00:00:00Z') },
  ];
  const packing = [
    { id: 'owned-derived', salesContractId: 'sale-derived', isOwnedByJiesong: 1, totalPrice: 60, purchaseCost: 300, purchaseContractNo: 'CG260001' },
    { id: 'third-derived', salesContractId: 'sale-derived', isOwnedByJiesong: 0, totalPrice: 40, purchaseCost: 900, purchaseContractNo: 'CG269999' },
    { id: 'owned-formal', salesContractId: 'sale-formal', isOwnedByJiesong: 1, totalPrice: 60, purchaseCost: 400, purchaseContractNo: 'CG260001' },
    { id: 'third-formal', salesContractId: 'sale-formal', isOwnedByJiesong: 0, totalPrice: 40, purchaseCost: 800, purchaseContractNo: 'CG269999' },
    { id: 'owned-next-day', salesContractId: 'sale-next-day', isOwnedByJiesong: 1, totalPrice: 10, purchaseCost: 20, purchaseContractNo: 'CG260001' },
    { id: 'owned-draft', salesContractId: 'sale-draft', isOwnedByJiesong: 1, totalPrice: 20, purchaseCost: 100, purchaseContractNo: 'CG260001' },
    { id: 'owned-cancelled', salesContractId: 'sale-cancelled', isOwnedByJiesong: 1, totalPrice: 9000, purchaseCost: 9000, purchaseContractNo: 'CG269999' },
  ];
  const payments = [
    { id: 'receipt-derived', type: 'RECEIVABLE_COLLECTION', salesContractId: 'sale-derived', amount: 25, currency: 'USD', paymentDate: PAYMENT_DATE },
    { id: 'receipt-formal', type: 'RECEIVABLE', salesContractId: 'sale-formal', amount: 20, currency: 'USD', paymentDate: PAYMENT_DATE },
    { id: 'payment-current', type: 'PAYABLE_PAYMENT', purchaseContractId: 'purchase-current', amount: 200, currency: 'CNY', paymentDate: PAYMENT_DATE },
    { id: 'wrong-receipt-currency', type: 'RECEIVABLE_COLLECTION', amount: 888, currency: 'CNY', paymentDate: PAYMENT_DATE },
    { id: 'wrong-payment-currency', type: 'EXPENSE', amount: 999, currency: 'USD', paymentDate: PAYMENT_DATE },
    { id: 'unallocated-receipt', type: 'RECEIVABLE_RECEIPT', amount: 777, currency: 'USD', paymentDate: PAYMENT_DATE },
    { id: 'allocated-receipt', type: 'RECEIVABLE_RECEIPT_ALLOCATED', amount: 666, currency: 'USD', paymentDate: PAYMENT_DATE },
    { id: 'income-ninety-days', type: 'INCOME', amount: 11, currency: 'USD', paymentDate: Date.parse('2026-08-20T12:00:00Z') },
    { id: 'expense-ninety-days', type: 'EXPENSE', amount: 7, currency: 'CNY', paymentDate: Date.parse('2026-08-20T12:00:00Z') },
    { id: 'old-income', type: 'INCOME', amount: 9999, currency: 'USD', paymentDate: Date.parse('2026-06-01T12:00:00Z') },
  ];
  seed({
    users: ROLES.map(role => ({ id: `user-${role}`, username: `synthetic-overview-${role}`, name: `Synthetic ${role}`, password: 'test-only-unused-hash', role, createdAt: NOW, updatedAt: NOW })),
    suppliers: [{ id: 'supplier-source', name: 'Synthetic Source Supplier', createdAt: NOW, updatedAt: NOW }],
    products: [{ id: 'product-source', customsName: 'Synthetic Source Widget', unit: '件', createdAt: NOW, updatedAt: NOW }],
    purchase_contracts: purchases.map(row => ({ ...row, createdAt: NOW, updatedAt: NOW })),
    sales_contracts: sales.map(row => ({ ...row, createdAt: NOW, updatedAt: NOW })),
    packing_items: packing.map(row => ({ ...row, productId: 'product-source', quantity: 1, createdAt: NOW, updatedAt: NOW })),
    payments: payments.map(row => ({ ...row, createdAt: NOW, updatedAt: NOW })),
  });
  const source = snapshot();
  for (const [table, rows] of [['sales_contracts', sales], ['purchase_contracts', purchases], ['packing_items', packing], ['payments', payments]]) {
    for (const row of rows) assert.deepEqual(project(source[table].find(stored => stored.id === row.id), Object.keys(row)), row);
  }

  // 3. Use real authentication, persisted roles, the full Express app and its normal limiter.
  db = require('../utils/prisma');
  const jwt = require('jsonwebtoken');
  const tokens = Object.fromEntries(ROLES.map(role => [role, jwt.sign(
    { userId: `user-${role}`, role: 'ADMIN' }, process.env.JWT_SECRET, { expiresIn: '1h' },
  )]));
  const app = require('../app');
  server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  let previousRemaining = 100;
  /**
   * 职责：read the actual route and verify status plus active, unreplaced API admission control.
   * @param {string} route existing route path
   * @param {object} filters query values
   * @param {string} role persisted synthetic user role, or ANONYMOUS
   * @param {number} expected expected HTTP status
   * @returns {Promise<object>} data response; throws on status or limiter mismatch
   */
  const get = async (route, filters = {}, role = 'FINANCE', expected = 200) => {
    const response = await fetch(`${base}${route}?${new URLSearchParams(filters)}`, {
      headers: tokens[role] ? { authorization: `Bearer ${tokens[role]}` } : {},
    });
    assert.equal(response.headers.get('x-ratelimit-limit'), '100');
    const remaining = Number(response.headers.get('x-ratelimit-remaining'));
    assert.equal(remaining, previousRemaining - 1, 'actual limiter must count each request');
    previousRemaining = remaining;
    const body = await response.json();
    assert.equal(response.status, expected, `${role} GET ${route}: ${body.message || ''}`);
    return body.data;
  };

  await t.test('Shanghai shipped-day margin and cash keep literal ownership/cost sources and the same sales drilldown', async () => {
    const before = snapshot();
    const period = { startDate: '2026-10-01', endDate: '2026-10-01' };
    const report = await get('/reports/business-overview', period, 'BOSS');
    assert.deepEqual(report.period, { ...period, dateField: 'shippedAt' });
    assert.deepEqual(project(report.overview, ['currency', 'contractCount', 'totalSales', 'totalPurchases', 'grossProfit', 'profitMargin', 'marginReady', 'cashReady', 'netCashCny', 'unavailableContracts']), {
      currency: 'CNY', contractCount: 2, totalSales: 900, totalPurchases: 700,
      grossProfit: 200, profitMargin: 200 / 900, marginReady: true, cashReady: true,
      netCashCny: 125, unavailableContracts: [],
    });
    // D: USD 60 × 7 − CNY 300. F: formal USD 60 × 8 − CNY 400.
    // Cash uses USD payments 25 × 60/100 and 20, not stored headers 50 and 30:
    // CNY (15×7 − 300/1000×200) + (20×8 − 400/1000×200) = 125.
    assert.deepEqual(report.trends.monthlySales, [{ month: '2026-10', amount: 900 }]);
    assert.deepEqual(project(report.funds, ['totalReceivable', 'totalPayable', 'overdueReceivable', 'overduePayable']), {
      totalReceivable: 115, totalPayable: 800, overdueReceivable: 0, overduePayable: 800,
    });
    const detail = await get('/sales', { shipped: 'true', shippedFrom: '2026-10-01', shippedTo: '2026-10-01', pageSize: 100 }, 'BOSS');
    assert.deepEqual(detail.items.map(row => row.id), ['sale-formal', 'sale-derived']);
    assert.equal(detail.pagination.total, 2);
    for (const row of detail.items) {
      const stored = before.sales_contracts.find(value => value.id === row.id);
      assert.deepEqual(project(row, ['id', 'contractNo', 'totalAmount', 'receivedAmount', 'amountSource', 'exchangeRate', 'status']), project(stored, ['id', 'contractNo', 'totalAmount', 'receivedAmount', 'amountSource', 'exchangeRate', 'status']));
      assert.equal(row.shippedAt, new Date(stored.shippedAt).toISOString());
    }
    const nextDay = await get('/reports/business-overview', { startDate: '2026-10-02', endDate: '2026-10-02' }, 'BOSS');
    assert.deepEqual(project(nextDay.overview, ['contractCount', 'totalSales', 'totalPurchases', 'grossProfit', 'netCashCny']), {
      contractCount: 1, totalSales: 90, totalPurchases: 20, grossProfit: 70, netCashCny: -4,
    });
    assert.deepEqual(nextDay.funds, report.funds, 'shipping period must not change current funds');
    assert.deepEqual(nextDay.inventory, report.inventory, 'shipping period must not change current inventory');
    const empty = await get('/reports/business-overview', { startDate: '2026-10-03', endDate: '2026-10-03' }, 'FINANCE');
    assert.equal(empty.overview.contractCount, 0);
    assert.deepEqual(empty.funds, report.funds);
    assert.deepEqual(await get('/reports/business-overview', period, 'ADMIN'), report);
    await get('/reports/business-overview', period, 'ANONYMOUS', 401);
    assert.deepEqual(snapshot(), before, 'report and drilldown reads must not change any persisted field');
  });

  await t.test('current payable/receivable snapshot uses formal versus derived ownership and stored receipt headers', async () => {
    const before = snapshot();
    const expected = {
      payable: { total: 1000, paid: 200, unpaid: 800 },
      receivable: { total: 150, received: 60, unreceived: 90 },
    };
    // D contributes 60/30; F keeps formal 60/30 despite its third-party 40;
    // next-day 10 and draft 20 remain current receivables, cancelled rows do not.
    for (const role of ROLES) assert.deepEqual(await get('/finance/stats', {}, role), expected);
    const receivables = await get('/finance/receivables', { pageSize: 100 }, 'BOSS');
    assert.deepEqual(receivables.items.map(row => project(row, ['id', 'totalAmount', 'receivedAmount', 'unreceiveAmount'])), [
      { id: 'sale-draft', totalAmount: 20, receivedAmount: 0, unreceiveAmount: 20 },
      { id: 'sale-next-day', totalAmount: 10, receivedAmount: 0, unreceiveAmount: 10 },
      { id: 'sale-formal', totalAmount: 60, receivedAmount: 30, unreceiveAmount: 30 },
      { id: 'sale-derived', totalAmount: 60, receivedAmount: 30, unreceiveAmount: 30 },
    ]);
    assert.equal(receivables.pagination.total, 4);
    const payables = await get('/finance/payables', { pageSize: 100 }, 'BOSS');
    assert.deepEqual(payables.items.map(row => project(row, ['id', 'totalAmount', 'paidAmount', 'unpaidAmount'])), [
      { id: 'purchase-current', totalAmount: 1000, paidAmount: 200, unpaidAmount: 800 },
    ]);
    await get('/finance/stats', {}, 'ANONYMOUS', 401);
    assert.deepEqual(snapshot(), before, 'finance snapshot and source lists must not rewrite headers or payments');
  });

  await t.test('UTC fixed-date payment trends respect actual date window, flow types and native currencies', async () => {
    const before = snapshot();
    const thirty = [{ label: '9/28', receivables: 45, payables: 200 }];
    const ninety = [{ label: '8/17', receivables: 11, payables: 7 }, ...thirty];
    assert.equal(new Date().toISOString(), '2026-10-06T12:00:00.000Z');
    assert.deepEqual(await get('/finance/payment-trends', { days: 30 }, 'BOSS'), thirty);
    assert.deepEqual(await get('/finance/payment-trends', { days: 90 }, 'FINANCE'), ninety);
    assert.deepEqual(await get('/finance/payment-trends', {}, 'ADMIN'), ninety);
    assert.deepEqual(await get('/finance/payment-trends', { days: 30 }, 'SALES'), thirty);
    await get('/finance/payment-trends', { days: 31 }, 'FINANCE', 400);
    await get('/finance/payment-trends', { days: 30 }, 'ANONYMOUS', 401);
    assert.deepEqual(snapshot(), before, 'trends must not create allocations, update balances or change decoy rows');
  });
  assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
  assert.equal(fs.statSync(database).mode & 0o777, 0o600);
  assert.deepEqual(snapshot(), source, 'all overview reads and refusals are business read-only');
});
