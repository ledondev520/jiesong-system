/**
 * Input: actual Express/auth/import/matching routes and migrated private synthetic SQLite
 * Output: three preview, mixed-row commit and replay/source-linkage lifecycle cases
 * Pos: internal bank-row regression; in-memory workbooks, no providers or real transfers
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('HTTP/SQLite: bank imports preserve preview, row/source and linkage boundaries', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-bank-import-'));
  fs.chmodSync(directory, 0o700);
  const database = path.join(directory, 'synthetic.db');
  process.env.DATABASE_URL = `file:${database}`;
  process.env.UPLOAD_DIR = path.join(directory, 'uploads');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-only-bank-import-secret-never-for-production';
  process.env.TZ = 'UTC';
  fs.mkdirSync(process.env.UPLOAD_DIR, { mode: 0o700 });
  let db, server;
  t.after(async () => {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    if (db) await db.$disconnect();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  // Apply committed migrations to a new private database. Never db push, rebuild
  // a shared Prisma client, read a real statement or archive an uploaded workbook.
  const migrations = path.resolve(__dirname, '../../prisma/migrations');
  const ddl = fs.readdirSync(migrations).sort()
    .filter(name => fs.statSync(path.join(migrations, name)).isDirectory())
    .map(name => fs.readFileSync(path.join(migrations, name, 'migration.sql'), 'utf8')).join('\n');
  execFileSync('python3', ['-c', 'import sqlite3,sys,os; os.umask(0o077); c=sqlite3.connect(sys.argv[1]); c.executescript(sys.stdin.read()); c.close()', database], { input: ddl });
  fs.chmodSync(database, 0o600);
  db = require('../utils/prisma');
  const jwt = require('jsonwebtoken');
  const tokens = {};
  for (const role of ['ADMIN', 'FINANCE', 'BOSS', 'PURCHASE', 'SALES', 'WAREHOUSE', 'INACTIVE']) {
    const user = await db.user.create({ data: { username: `synthetic-bank-${role}`, password: 'test-only-unused-hash', name: `Synthetic ${role}`, role: role === 'INACTIVE' ? 'FINANCE' : role, isActive: role !== 'INACTIVE' } });
    // Database role/status must win over deliberately misleading JWT role claims.
    tokens[role] = jwt.sign({ userId: user.id, role: 'ADMIN' }, process.env.JWT_SECRET);
  }
  const sale = await db.salesContract.create({ data: { contractNo: 'EXP-SYNTHETIC-BANK-LINK', status: 'SHIPPED', totalAmount: 1000, receivedAmount: 37, exchangeRate: 7, amountSource: 'FORMAL_DOCUMENT' } });
  const app = require('../app'); // Does not start scheduled jobs/provider calls.
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const call = async (method, route, body, role = 'FINANCE', expected = 200) => {
    const multipart = body instanceof FormData;
    const response = await fetch(base + route, {
      method,
      headers: { ...(tokens[role] ? { authorization: `Bearer ${tokens[role]}` } : {}), ...(multipart ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: multipart ? body : JSON.stringify(body) }),
    });
    const result = await response.json();
    assert.equal(response.status, expected, `${method} ${route}: ${result.message}`);
    return result.data;
  };
  // Read persisted facts through a separate read-only SQLite connection.
  const snapshot = () => JSON.parse(execFileSync('python3', ['-c', `import sqlite3,sys,json
c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True)
c.row_factory=sqlite3.Row
tables=['bank_transactions','finance_data_batches','invoice_records','payments','sales_contracts','purchase_contracts','general_ledger_entries','financial_periods','balance_sheet_entries','account_balance_entries','income_statement_entries','cash_flow_statement_entries']
print(json.dumps({table:[dict(row) for row in c.execute('SELECT * FROM '+table+' ORDER BY id')] for table in tables}))
c.close()`, database], { encoding: 'utf8', timeout: 10000 }));
  const ledgers = () => Object.fromEntries(Object.entries(snapshot()).filter(([table]) => !['bank_transactions', 'finance_data_batches'].includes(table)));
  const originalLedgers = ledgers();
  const xlsx = require('xlsx');
  const headers = ['交易日期', '交易时间', '交易金额', '余额', '对方户名', '摘要', '交易流水号', '付方账户', '付方开户行', '付方账户币种', '收方账户', '收方开户银行', '收方账户币种'];
  const row = (date, amount, balance, fields = {}) => [date, `${date} 12:34:56`, amount, balance, 'Synthetic bank counterparty', fields.summary || 'Synthetic original summary', fields.txnId || `synthetic-${date}-${amount}`, fields.account || '900000000000000001', 'Synthetic bank', fields.currency || '人民币', fields.account || '900000000000000001', 'Synthetic bank', fields.currency || '人民币'];
  const incoming = row('2026-10-01', 100.25, 1000.25);
  const outgoing = row('2026-10-02', -25.1, 975.15);
  const usd = row('2026-10-01', 100.25, 1000.25, { currency: '美元' });
  const otherAccount = row('2026-10-01', 100.25, 1000.25, { account: '900000000000000002' });
  const badDate = row('invalid-synthetic-date', 50, 1025.15);
  const zero = row('2026-10-03', 0, 975.15);
  const rows = [incoming, [...incoming], outgoing, usd, otherAccount, badDate, zero];
  const form = (dataRows, fileName = 'synthetic-bank.xlsx') => {
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet([['Synthetic statement title'], headers, ...dataRows]), 'Synthetic bank rows');
    const upload = new FormData();
    upload.append('bankType', 'GENERIC');
    upload.append('file', new Blob([xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName);
    return upload;
  };
  let batchId;

  await t.test('preview/cancel-equivalent and all-invalid commit are nonmutating, with actual role/status checks', async () => {
    const before = snapshot();
    for (const role of ['FINANCE', 'ADMIN']) {
      const preview = await call('POST', '/bank-flow/import/preview', form(rows), role);
      assert.equal(preview.totalRows, 7);
      assert.equal(preview.validRows, 5, 'preview counts parsed rows before commit deduplication');
      assert.equal(preview.errorRows, 2);
      assert.equal(preview.mapping.date, '交易日期');
      assert.equal(preview.mapping.signedAmount, '交易金额');
      assert.equal(preview.mapping.balance, '余额');
      assert.deepEqual(preview.errors.map(error => error.row), [8, 9]);
      assert.equal(preview.preview[0].accountNoMasked, '****0001');
      assert.equal(preview.preview[2].amount, -25.1);
      assert.equal(preview.preview[3].currency, 'USD');
      assert.deepEqual(snapshot(), before, 'discarding preview requires no rollback or cancel request');
    }
    for (const [role, expected] of [['BOSS', 403], ['PURCHASE', 403], ['SALES', 403], ['WAREHOUSE', 403], ['INACTIVE', 401], ['ANONYMOUS', 401]]) {
      for (const route of ['/bank-flow/import/preview', '/bank-flow/import']) {
        await call('POST', route, form(rows), role, expected);
        assert.deepEqual(snapshot(), before, 'denied upload must not create a batch or rows');
      }
    }
    const invalidPreview = await call('POST', '/bank-flow/import/preview', form([badDate, zero]));
    assert.equal(invalidPreview.validRows, 0);
    assert.equal(invalidPreview.errorRows, 2);
    const rejected = await call('POST', '/bank-flow/import', form([badDate, zero]), 'FINANCE', 400);
    assert.equal(rejected.errors.length, 2);
    await call('POST', '/bank-flow/import', {}, 'FINANCE', 400);
    assert.deepEqual(snapshot(), before, 'all-invalid/no-file commit must not persist an empty batch');
  });

  await t.test('mixed rows commit valid records, report parse errors and persist correct batch/account/currency balances', async () => {
    const result = await call('POST', '/bank-flow/import', form(rows));
    assert.equal(result.success, 4);
    assert.equal(result.failed, 0, 'parser errors remain parseErrors rather than failed database writes');
    assert.equal(result.skipped, 1);
    assert.deepEqual(result.parseErrors.map(error => error.row), [8, 9]);
    assert.equal(result.errors.length, 1);
    batchId = result.batchId;
    assert.ok(batchId);
    const persisted = snapshot();
    assert.equal(persisted.bank_transactions.length, 4);
    assert.equal(persisted.finance_data_batches.length, 1);
    const batch = persisted.finance_data_batches[0];
    assert.equal(batch.id, batchId);
    assert.equal(batch.type, 'BANK_FLOW');
    assert.equal(batch.fileName, 'synthetic-bank.xlsx');
    assert.equal(batch.recordCount, persisted.bank_transactions.length);
    assert.equal(batch.dataStartDate, '2026-10-01');
    assert.equal(batch.dataEndDate, '2026-10-02');
    for (const stored of persisted.bank_transactions) {
      assert.equal(stored.batchId, batchId);
      assert.equal(stored.bankName, 'Synthetic bank');
      assert.match(stored.accountNoMasked, /^\*{4}000[12]$/);
      assert.equal(stored.matchStatus, 'PENDING');
      assert.equal(stored.matchedContractId, null);
      assert.equal(stored.matchedAt, null);
    }
    const cnyAccount = persisted.bank_transactions.filter(stored => stored.currency === 'CNY' && stored.accountNoMasked === '****0001').sort((a, b) => a.txnDate.localeCompare(b.txnDate));
    assert.deepEqual(cnyAccount.map(stored => [stored.direction, stored.amount, stored.balance]), [['IN', 100.25, 1000.25], ['OUT', -25.1, 975.15]]);
    assert.equal(Math.round((cnyAccount[0].balance + cnyAccount[1].amount) * 100), Math.round(cnyAccount[1].balance * 100));
    const list = await call('GET', `/bank-flow/transactions?batchId=${batchId}&currency=CNY`);
    assert.equal(list.pagination.total, 3);
    const usdList = await call('GET', `/bank-flow/transactions?batchId=${batchId}&currency=USD`);
    assert.equal(usdList.pagination.total, 1);
    assert.equal(usdList.items[0].accountNoMasked, '****0001');
    const batches = await call('GET', '/bank-flow/batches?type=BANK_FLOW');
    assert.equal(batches[0]._count.bankTransactions, batches[0].recordCount);
    assert.deepEqual(ledgers(), originalLedgers, 'importing source rows cannot post a payment or update contract/accounting balances');
    assert.equal(JSON.stringify(persisted).includes('900000000000000001'), false, 'no full synthetic account is persisted');
  });

  await t.test('replay preserves matched/ignored source rows; overlap writes only new rows and BOSS remains read-only', async () => {
    const original = snapshot().bank_transactions;
    const linked = original.find(stored => stored.currency === 'USD' && stored.accountNoMasked === '****0001' && stored.direction === 'IN');
    const ignored = original.find(stored => stored.currency === 'CNY' && stored.direction === 'OUT');
    const matchBody = { entityType: 'BANK', entityId: linked.id, contractType: 'SALES', contractId: sale.id };
    const matched = await call('POST', '/finance/match', matchBody);
    assert.equal(matched.matchStatus, 'MATCHED');
    assert.equal(matched.matchedContractId, sale.id);
    assert.equal(matched.matchScore, 100);
    assert.ok(matched.matchedAt);
    await call('POST', '/finance/ignore', { entityType: 'BANK', entityId: ignored.id });
    const before = snapshot();
    const storedLink = before.bank_transactions.find(stored => stored.id === linked.id);
    assert.equal(storedLink.matchStatus, 'MATCHED');
    assert.equal(storedLink.matchedContractId, sale.id);
    assert.equal(storedLink.matchedContractType, 'SALES');
    assert.equal(storedLink.matchScore, 100);
    assert.ok(storedLink.matchedAt);
    const storedIgnore = before.bank_transactions.find(stored => stored.id === ignored.id);
    assert.equal(storedIgnore.matchStatus, 'IGNORED');
    assert.equal(storedIgnore.matchedContractId, null);
    assert.equal(storedIgnore.matchedContractType, null);
    assert.equal(storedIgnore.matchScore, null);
    assert.equal(storedIgnore.matchedAt, null);
    // Exact replay and a renamed source with altered time/summary/transaction ID
    // must use the existing masked-account/currency/balance trajectory identity.
    const alteredIncoming = row('2026-10-01', 100.25, 1000.25, { currency: 'USD', summary: 'Synthetic alternate source summary', txnId: 'synthetic-alternate-source-id' });
    alteredIncoming[1] = '2026-10-01 16:45:00';
    for (const replayRows of [rows, [incoming, outgoing, alteredIncoming, otherAccount]]) {
      const result = await call('POST', '/bank-flow/import', form(replayRows, 'synthetic-renamed-source.xlsx'));
      assert.equal(result.success, 0);
      assert.equal(result.failed, 0);
      assert.equal(result.skipped, replayRows === rows ? 5 : 4);
      assert.equal(result.batchId, null);
      assert.deepEqual(snapshot(), before, 'replay must retain original source, IDs, match metadata and no empty batch');
    }
    for (const [route, body] of [['/finance/match', matchBody], ['/finance/unmatch', { entityType: 'BANK', entityId: linked.id }], ['/finance/ignore', { entityType: 'BANK', entityId: linked.id }]]) {
      await call('POST', route, body, 'BOSS', 403);
      assert.deepEqual(snapshot(), before);
    }
    const read = await call('GET', `/bank-flow/transactions?batchId=${batchId}&currency=USD`, undefined, 'BOSS');
    assert.equal(read.items.find(stored => stored.id === linked.id).matchedContractId, sale.id);
    const unmatched = await call('GET', '/finance/unmatched?type=BANK');
    assert.equal(unmatched.bankTotal, 2, 'matched and ignored rows leave the existing pending queue');
    const next = row('2026-10-03', 50.5, 1050.75, { currency: 'USD', txnId: linked.txnId });
    const overlap = await call('POST', '/bank-flow/import', form([alteredIncoming, next], 'synthetic-overlapping-source.xlsx'));
    assert.equal(overlap.success, 1);
    assert.equal(overlap.skipped, 1);
    assert.notEqual(overlap.batchId, batchId);
    const after = snapshot();
    assert.equal(after.bank_transactions.length, 5);
    assert.equal(after.finance_data_batches.length, 2);
    assert.deepEqual(after.bank_transactions.filter(stored => stored.batchId === batchId), before.bank_transactions);
    const newBatch = after.finance_data_batches.find(batch => batch.id === overlap.batchId);
    assert.equal(newBatch.recordCount, 1);
    assert.equal(newBatch.dataStartDate, '2026-10-03');
    assert.equal(newBatch.dataEndDate, '2026-10-03');
    const newRow = after.bank_transactions.find(stored => stored.batchId === overlap.batchId);
    assert.equal(newRow.balance, 1050.75);
    assert.equal(newRow.amount, 50.5);
    assert.equal(newRow.matchStatus, 'PENDING');
    assert.equal(newRow.matchedContractId, null);
    assert.equal(newRow.txnId, linked.txnId, 'a reused transaction ID alone must not erase a new balance trajectory');
    assert.deepEqual(ledgers(), originalLedgers, 'source linkage/replay are not receipt allocation or accounting posting');
  });
  assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
  assert.equal(fs.statSync(database).mode & 0o777, 0o600);
  assert.equal(fs.statSync(process.env.UPLOAD_DIR).mode & 0o777, 0o700);
  assert.deepEqual(fs.readdirSync(process.env.UPLOAD_DIR), [], 'in-memory uploads must not archive synthetic statements');
});
