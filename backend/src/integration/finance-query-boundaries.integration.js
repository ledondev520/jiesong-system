/**
 * Input: actual Express app and private SQLite fixtures containing synthetic finance rows
 * Output: query/pagination/currency consistency and existing read-role boundary regression
 * Pos: read-only finance HTTP integration coverage; never imports files or writes via the API
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROLES = ['ADMIN', 'FINANCE', 'BOSS', 'SALES', 'PURCHASE', 'WAREHOUSE'];

test('HTTP/SQLite: finance query filters, classifications and existing read boundaries', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-finance-queries-'));
  fs.chmodSync(directory, 0o700);
  const database = path.join(directory, 'synthetic.db');
  process.env.DATABASE_URL = `file:${database}`;
  process.env.UPLOAD_DIR = path.join(directory, 'uploads');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-only-finance-queries-never-for-production';
  let db, server;
  t.after(async () => {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    if (db) await db.$disconnect();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  // Build an empty isolated schema. Never run db push or read a business database.
  const ddl = execFileSync(process.execPath, [require.resolve('prisma/build/index.js'),
    'migrate', 'diff', '--from-empty', '--to-schema-datamodel',
    path.resolve(__dirname, '../../prisma/schema.prisma'), '--script'],
  { encoding: 'utf8', timeout: 30000 });
  execFileSync('python3', ['-c', 'import sqlite3,sys,os; os.umask(0o077); c=sqlite3.connect(sys.argv[1]); c.executescript(sys.stdin.read()); c.close()', database], { input: ddl });
  fs.chmodSync(database, 0o600);
  db = require('../utils/prisma');
  const jwt = require('jsonwebtoken');
  const config = require('../config');
  const tokens = {};
  for (const role of ROLES) {
    const user = await db.user.create({ data: { username: `synthetic-finance-${role}`, password: 'test-only-unused-hash', name: `Synthetic ${role}`, role } });
    tokens[role] = jwt.sign({ userId: user.id }, config.jwt.secret);
  }
  for (const id of ['bank-a', 'bank-b', 'invoice-a', 'invoice-b']) {
    await db.financeDataBatch.create({ data: { id, type: id.startsWith('bank') ? 'BANK_FLOW' : 'INVOICE', fileName: `${id}-synthetic`, recordCount: 0 } });
  }
  const tx = (id, amount, fields = {}) => ({ id, batchId: 'bank-a', currency: 'CNY', accountNoMasked: '****0001', txnTime: `2026-10-${id.slice(-2)} 12:00:00`, txnDate: `2026-10-${id.slice(-2)}`, direction: amount < 0 ? 'OUT' : 'IN', amount, counterpart: 'Synthetic Alpha & Co', summary: 'fixture', txnId: `synthetic-${id}`, ...fields });
  const transactions = [
    tx('tx01', 10), tx('tx02', -10), tx('tx03', 20), tx('tx04', -20), tx('tx05', 30),
    tx('tx06', -30, { counterpart: 'Synthetic Beta', summary: 'summary-needle' }),
    tx('tx07', 0), tx('tx08', -15, { currency: 'USD' }), tx('tx09', 15, { currency: 'USD' }),
    tx('tx10', 15, { batchId: 'bank-b', accountNoMasked: '****0002' }),
    tx('tx11', 25, { counterpart: 'Synthetic Beta', txnId: 'transaction-id-needle' }),
  ];
  await db.bankTransaction.createMany({ data: transactions });
  const invoice = (id, amount, fields = {}) => ({ id, batchId: 'invoice-a', seller: 'Synthetic Alpha & Co', buyer: 'Synthetic Buyer', itemName: 'Synthetic Widget', invNo: `synthetic-${id}`, invDate: `2026-10-${id.slice(-2)}`, amount, tax: amount * 0.1, total: amount + amount * 0.1, status: '正常', isPositive: '是', ...fields });
  const invoices = [
    invoice('inv01', 100), invoice('inv02', 200),
    invoice('inv03', 300, { status: '已红冲-全额' }),
    invoice('inv04', -300, { isPositive: '否' }),
    invoice('inv05', 500, { seller: 'Synthetic Beta', buyer: 'buyer-needle' }),
    invoice('inv06', 600, { seller: 'Synthetic Beta', itemName: 'item-needle' }),
    invoice('inv07', 700, { seller: 'Synthetic Beta', invNo: 'number-needle' }),
    invoice('inv08', 800, { batchId: 'invoice-b' }),
  ];
  await db.invoiceRecord.createMany({ data: invoices });
  const app = require('../app');
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const get = async (route, filters = {}, role = 'FINANCE', expected = 200) => {
    const response = await fetch(`${base}${route}?${new URLSearchParams(filters)}`, { headers: tokens[role] ? { authorization: `Bearer ${tokens[role]}` } : {} });
    const body = await response.json();
    assert.equal(response.status, expected, `${role} GET ${route}: ${body.message || ''}`);
    return body.data;
  };
  const txList = filters => get('/bank-flow/transactions', { pageSize: 500, ...filters });
  const txStats = filters => get('/bank-flow/transactions/stats', filters);
  const expectedTx = rows => ({
    totalIn: rows.filter(r => r.direction === 'IN').reduce((sum, r) => sum + r.amount, 0),
    totalOut: Math.abs(rows.filter(r => r.direction === 'OUT').reduce((sum, r) => sum + r.amount, 0)),
    txnCount: rows.length,
  });
  const checkTx = async (filters, rows, currency = 'CNY') => {
    const list = await txList(filters);
    const stats = await txStats(filters);
    const totals = expectedTx(rows);
    assert.deepEqual(list.items.map(r => r.id), [...rows].sort((a, b) => b.txnTime.localeCompare(a.txnTime)).map(r => r.id));
    assert.equal(list.pagination.total, rows.length);
    assert.deepEqual(stats, { ...totals, netFlow: totals.totalIn - totals.totalOut, currency });
  };
  const cny = transactions.filter(r => r.currency === 'CNY');
  const usd = transactions.filter(r => r.currency === 'USD');
  await t.test('bank list and aggregate share currency, signed magnitude and intersecting filters', async () => {
    const cases = [
      [{}, cny], [{ currency: 'usd' }, usd, 'USD'],
      // Unknown codes, including ALL, remain explicit empty currency selections.
      [{ currency: 'all' }, [], 'ALL'], [{ currency: 'XYZ' }, [], 'XYZ'],
      [{ amountMin: 10, amountMax: 20 }, cny.filter(r => Math.abs(r.amount) >= 10 && Math.abs(r.amount) <= 20)],
      [{ direction: 'OUT', amountMin: 10, amountMax: 20 }, cny.filter(r => r.direction === 'OUT' && Math.abs(r.amount) <= 20)],
      [{ amountMax: 10 }, cny.filter(r => Math.abs(r.amount) <= 10)],
      [{ amountMin: 0, amountMax: 0 }, cny.filter(r => r.amount === 0)],
      [{ search: 'Synthetic Alpha & Co', dateFrom: '2026-10-02', dateTo: '2026-10-04', batchId: 'bank-a', accountNoMasked: '****0001' }, cny.filter(r => r.txnDate >= '2026-10-02' && r.txnDate <= '2026-10-04')],
      [{ search: 'summary-needle' }, [transactions[5]]],
      [{ search: 'transaction-id-needle' }, [transactions[10]]],
      [{ search: 'no-synthetic-match' }, []],
    ];
    for (const [filters, rows, currency] of cases) await checkTx(filters, rows, currency);
    const filters = { amountMin: 10, amountMax: 20, pageSize: 2 };
    const first = await txList({ ...filters, page: 1 });
    const second = await txList({ ...filters, page: 2 });
    assert.deepEqual(first.items.map(r => r.id), ['tx10', 'tx04']);
    assert.deepEqual(second.items.map(r => r.id), ['tx03', 'tx02']);
    assert.equal(first.pagination.total, 5);
    assert.equal(second.pagination.total, 5);
    assert.equal(first.pagination.totalPages, 3);
  });
  await t.test('empty currency cannot mix CNY and USD while stats show only CNY', async () => {
    await checkTx({ currency: '' }, cny);
  });
  await t.test('invalid amount ranges and pagination are rejected before a query result', async () => {
    for (const filters of [{ amountMin: -1 }, { amountMin: 20, amountMax: 10 }, { amountMax: 'NaN' }]) {
      await get('/bank-flow/transactions', filters, 'FINANCE', 400);
      await get('/bank-flow/transactions/stats', filters, 'FINANCE', 400);
    }
    await get('/bank-flow/transactions', { page: 0 }, 'FINANCE', 400);
    await get('/bank-flow/invoices', { pageSize: 501 }, 'FINANCE', 400);
  });
  const checkInvoices = async (filters, rows) => {
    const list = await get('/bank-flow/invoices', { pageSize: 500, ...filters });
    const stats = await get('/bank-flow/invoices/stats', filters);
    const valid = rows.filter(r => r.status === '正常' && r.isPositive === '是');
    assert.deepEqual(list.items.map(r => r.id), [...rows].sort((a, b) => b.invDate.localeCompare(a.invDate)).map(r => r.id));
    assert.equal(list.pagination.total, rows.length);
    assert.deepEqual(stats, { validTotal: valid.reduce((sum, r) => sum + r.total, 0), validTax: valid.reduce((sum, r) => sum + r.tax, 0), validAmount: valid.reduce((sum, r) => sum + r.amount, 0), validCount: valid.length, reversedCount: rows.filter(r => r.status.includes('红冲')).length, totalCount: rows.length });
  };
  await t.test('related-invoice search reaches seller, buyer, item and invoice number before pagination', async () => {
    for (const [search, rows] of [
      ['Synthetic Alpha & Co', invoices.filter(r => r.seller === 'Synthetic Alpha & Co')],
      ['buyer-needle', [invoices[4]]], ['item-needle', [invoices[5]]],
      ['number-needle', [invoices[6]]], ['no-synthetic-match', []],
    ]) await checkInvoices({ search }, rows);
    const page = await get('/bank-flow/invoices', { search: 'Synthetic Alpha & Co', page: 2, pageSize: 2 });
    assert.deepEqual(page.items.map(r => r.id), ['inv03', 'inv02']);
    assert.equal(page.pagination.total, 5);
    assert.equal(page.pagination.totalPages, 3);
  });
  for (const [label, filters, rows] of [
    ['normal', { search: 'Synthetic Alpha & Co', status: '正常' }, invoices.filter(r => r.seller === 'Synthetic Alpha & Co' && r.status === '正常')],
    ['reversed', { status: '已红冲-全额' }, [invoices[2]]],
    ['negative', { isPositive: '否' }, [invoices[3]]],
    ['date and batch', { batchId: 'invoice-a', dateFrom: '2026-10-01', dateTo: '2026-10-02' }, [invoices[0], invoices[1]]],
  ]) {
    await t.test(`invoice ${label} filter retains valid versus reversed classification`, async () => {
      await checkInvoices(filters, rows);
    });
  }
  await t.test('existing role boundaries allow authenticated bank/invoice reads and restrict evidence', async () => {
    for (const role of ROLES) {
      const list = await get('/bank-flow/transactions', { currency: 'USD' }, role);
      assert.equal(list.pagination.total, 2);
      const stats = await get('/bank-flow/transactions/stats', { currency: 'USD' }, role);
      assert.equal(stats.txnCount, 2);
      const related = await get('/bank-flow/invoices', { search: 'number-needle' }, role);
      assert.equal(related.items[0].id, 'inv07');
      const expected = ['ADMIN', 'FINANCE'].includes(role) ? 200 : 403;
      await get('/finance/statements/evidence/summary', {}, role, expected);
      await get('/finance/statements/evidence/documents', {}, role, expected);
    }
    await get('/bank-flow/transactions', {}, 'ANONYMOUS', 401);
    await get('/bank-flow/invoices/stats', {}, 'ANONYMOUS', 401);
  });
  assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
  assert.equal(fs.statSync(database).mode & 0o777, 0o600);
  assert.equal(await db.bankTransaction.count(), transactions.length, 'GET matrix must not mutate transactions');
  assert.equal(await db.invoiceRecord.count(), invoices.length, 'GET matrix must not mutate invoices');
});
