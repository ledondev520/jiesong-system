/**
 * Input: actual Express app and private SQLite with draft/effective/cancelled/partially-paid/overpaid purchase contracts
 * Output: every payables endpoint (finance stats/list, dashboard, business overview, CSV export, AI context) returns identical totals
 * Pos: owner decision 12 consistency regression; read-only HTTP, synthetic data only
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const NOW = Date.now();
const PAST = new Date(NOW - 40 * 86400000);
const FUTURE = new Date(NOW + 40 * 86400000);

// Expected (CNY): in effect = SIGNED 1000/200 (overdue 800), SHIPPED 500/500, RECEIVED 300/0 (future),
// COMPLETED 100/150 overpaid → 0, legacy PENDING_INSPECTION 400/100 (overdue 300) and lowercase 'shipped' 200/0 (future)
// still count (status aliases/spellings normalised). DRAFT 7000/0, lowercase 'draft' 5000/0 and CANCELLED 9000/1000 are excluded.
const EXPECTED = { total: 2500, paid: 950, unpaid: 1600, overdue: 1100 };

test('HTTP/SQLite: draft contracts are not payables and every endpoint shows the same totals', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-payables-'));
  fs.chmodSync(directory, 0o700);
  const database = path.join(directory, 'synthetic.db');
  process.env.DATABASE_URL = `file:${database}`;
  process.env.UPLOAD_DIR = path.join(directory, 'uploads');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-only-payables-basis-never-for-production';
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
  const user = await db.user.create({ data: { username: 'synthetic-payables-finance', password: 'test-only-unused-hash', name: 'Synthetic', role: 'FINANCE' } });
  const token = jwt.sign({ userId: user.id }, config.jwt.secret);
  const supplier = await db.supplier.create({ data: { name: 'Synthetic Payables Supplier' } });
  const contracts = [
    ['CG-SIGNED', 'SIGNED', 1000, 200, PAST],
    ['CG-SHIPPED', 'SHIPPED', 500, 500, PAST],
    ['CG-RECEIVED', 'RECEIVED', 300, 0, FUTURE],
    ['CG-OVERPAID', 'COMPLETED', 100, 150, PAST],
    ['CG-LEGACY', 'PENDING_INSPECTION', 400, 100, PAST],
    ['CG-LOWER', 'shipped', 200, 0, FUTURE],
    ['CG-DRAFT', 'DRAFT', 7000, 0, PAST],
    ['CG-DRAFT-LOWER', 'draft', 5000, 0, PAST],
    ['CG-CANCELLED', 'CANCELLED', 9000, 1000, PAST],
  ];
  for (const [contractNo, status, totalAmount, paidAmount, expectedDate] of contracts) {
    await db.purchaseContract.create({ data: { contractNo, supplierId: supplier.id, status, totalAmount, paidAmount, expectedDate } });
  }
  const app = require('../app');
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const headers = { authorization: `Bearer ${token}` };
  const getJson = async (route) => {
    const response = await fetch(`${base}${route}`, { headers });
    const body = await response.json();
    assert.equal(response.status, 200, `GET ${route}: ${body.message || ''}`);
    return body.data;
  };

  const stats = (await getJson('/finance/stats')).payable;
  await t.test('finance overview (stats)', () => assert.deepEqual(stats, { total: EXPECTED.total, paid: EXPECTED.paid, unpaid: EXPECTED.unpaid }));

  await t.test('payables list lists only in-effect contracts and its rows sum to the same unpaid total', async () => {
    const list = await getJson('/finance/payables?pageSize=100');
    assert.deepEqual(list.items.map(row => row.contractNo).sort(), ['CG-LEGACY', 'CG-LOWER', 'CG-OVERPAID', 'CG-RECEIVED', 'CG-SHIPPED', 'CG-SIGNED']);
    assert.equal(list.pagination.total, 6);
    assert.equal(list.items.reduce((sum, row) => sum + row.unpaidAmount, 0), EXPECTED.unpaid);
  });

  await t.test('dashboard analytics (首页)', async () => {
    const purchase = (await getJson('/dashboard/analytics')).contracts.purchase;
    assert.deepEqual([purchase.totalAmount, purchase.paidAmount, purchase.unpaidAmount], [EXPECTED.total, EXPECTED.paid, EXPECTED.unpaid]);
  });

  await t.test('business overview (经营执行)', async () => {
    const funds = (await getJson('/reports/business-overview')).funds;
    assert.deepEqual([funds.totalPayable, funds.overduePayable], [EXPECTED.unpaid, EXPECTED.overdue]);
  });

  await t.test('purchase CSV export 未付金额 column sums to the same total (drafts show 0)', async () => {
    const response = await fetch(`${base}/export/purchases`, { headers });
    assert.equal(response.status, 200);
    const lines = (await response.text()).replace(/^﻿/, '').trim().split(/\r?\n/).slice(1);
    const rows = lines.map(line => line.slice(1, -1).split('","'));
    assert.equal(rows.length, contracts.length);
    assert.equal(rows.reduce((sum, row) => sum + Number(row[4]), 0), EXPECTED.unpaid);
    assert.equal(Number(rows.find(row => row[0] === 'CG-DRAFT')[4]), 0);
    assert.equal(Number(rows.find(row => row[0] === 'CG-DRAFT-LOWER')[4]), 0);
  });

  await t.test('AI context 财务概况', async () => {
    const { getDbContext } = require('../services/ai/contextService');
    const context = await getDbContext('价格和应收应付');
    assert.match(context, new RegExp(`应付总额¥${EXPECTED.total}, 已付¥${EXPECTED.paid}, 待付¥${EXPECTED.unpaid}`));
  });

  await t.test('past-delivery payables filter keeps the same basis', async () => {
    const list = await getJson('/finance/payables?pastDelivery=true&outstandingOnly=true&pageSize=100');
    assert.deepEqual(list.items.map(row => row.contractNo).sort(), ['CG-LEGACY', 'CG-SIGNED']);
  });
});
