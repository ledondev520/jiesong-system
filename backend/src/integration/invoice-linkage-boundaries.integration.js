/**
 * Input: actual Express/auth/service path and migrated private synthetic SQLite
 * Output: three bounded invoice import/linkage, failed target and stale-match cases
 * Pos: internal invoice regression; no real files, providers, submissions or ledger adjustments
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, fork } = require('node:child_process');

test('HTTP/SQLite: invoice linkage preserves source facts and current match state', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-invoice-linkage-'));
  fs.chmodSync(directory, 0o700);
  const database = path.join(directory, 'synthetic.db');
  process.env.DATABASE_URL = `file:${database}`;
  process.env.UPLOAD_DIR = path.join(directory, 'uploads');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-only-invoice-linkage-never-for-production';
  process.env.TZ = 'UTC';
  const originalUmask = process.umask(0o022);
  let db, server, worker;
  t.after(async () => {
    if (worker?.child.connected) {
      worker.child.send({ type: 'stop' });
      await new Promise(resolve => {
        worker.child.once('exit', resolve);
        setTimeout(() => { worker.child.kill('SIGKILL'); resolve(); }, 2000).unref();
      });
    }
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    if (db) await db.$disconnect();
    fs.rmSync(directory, { recursive: true, force: true });
    process.umask(originalUmask);
  });
  // Apply committed migrations without db push, shared data or client generation.
  const migrations = path.resolve(__dirname, '../../prisma/migrations');
  const ddl = fs.readdirSync(migrations).sort()
    .filter(name => fs.statSync(path.join(migrations, name)).isDirectory())
    .map(name => fs.readFileSync(path.join(migrations, name, 'migration.sql'), 'utf8')).join('\n');
  execFileSync('python3', ['-c', 'import sqlite3,sys,os; os.umask(0o077); c=sqlite3.connect(sys.argv[1]); c.executescript(sys.stdin.read()); c.close()', database], { input: ddl });
  fs.chmodSync(database, 0o600);
  db = require('../utils/prisma');
  const jwt = require('jsonwebtoken');
  const tokens = {};
  for (const role of ['ADMIN', 'FINANCE', 'SALES', 'PURCHASE', 'WAREHOUSE', 'BOSS', 'INACTIVE']) {
    const user = await db.user.create({ data: { username: `synthetic-invoice-${role}`, name: `Synthetic ${role}`, password: 'test-only-unused-hash', role: role === 'INACTIVE' ? 'FINANCE' : role, isActive: role !== 'INACTIVE' } });
    // Authentication must use the database role, not this misleading JWT claim.
    tokens[role] = jwt.sign({ userId: user.id, role: 'ADMIN' }, process.env.JWT_SECRET);
  }
  const app = require('../app');
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const call = async (route, body, role = 'FINANCE', origin = base) => {
    const form = body instanceof FormData;
    const response = await fetch(origin + route, { method: 'POST', headers: { ...(tokens[role] ? { authorization: `Bearer ${tokens[role]}` } : {}), ...(form ? {} : { 'content-type': 'application/json' }) }, ...(body === undefined ? {} : { body: form ? body : JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  };
  const good = async (...args) => {
    const response = await call(...args);
    assert.equal(response.status, 200, `${args[0]}: ${response.body.message}`);
    return response.body.data;
  };
  const get = async route => {
    const response = await fetch(base + route, { headers: { authorization: `Bearer ${tokens.FINANCE}` } });
    assert.equal(response.status, 200);
    return (await response.json()).data;
  };
  // Independent read-only connection verifies persisted state, including untouched ledgers.
  const snapshot = () => JSON.parse(execFileSync('python3', ['-c', `import sqlite3,sys,json
c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True)
c.row_factory=sqlite3.Row
tables=['finance_data_batches','invoice_records','bank_transactions','purchase_contracts','sales_contracts','payments','general_ledger_entries','financial_periods','balance_sheet_entries']
print(json.dumps({table:[dict(row) for row in c.execute('SELECT * FROM '+table+' ORDER BY id')] for table in tables}))
c.close()`, database], { encoding: 'utf8', timeout: 10000 }));
  const runSql = sql => execFileSync('python3', ['-c', 'import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); c.executescript(sys.argv[2]); c.close()', database, sql]);
  let sequence = 0;
  const supplier = await db.supplier.create({ data: { name: 'Synthetic Invoice Supplier' } });
  const purchase = (fields = {}) => db.purchaseContract.create({ data: { contractNo: `CG-SYNTHETIC-INVOICE-${++sequence}`, supplierId: supplier.id, totalAmount: 110, signedAt: new Date('2026-10-01T00:00:00Z'), status: 'SIGNED', ...fields } });
  const batch = await db.financeDataBatch.create({ data: { type: 'INVOICE', fileName: 'synthetic-fixture-only', recordCount: 0 } });
  const invoice = (fields = {}) => db.invoiceRecord.create({ data: { batchId: batch.id, invNo: `SYNTHETIC-INVOICE-${++sequence}`, invDate: '2026-10-02', seller: supplier.name, buyer: 'Synthetic Invoice Buyer', amount: 100, tax: 10, total: 110, status: '正常', isPositive: '是', ...fields } });
  const workbook = () => {
    const xlsx = require('xlsx');
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet([
      ['发票代码', '发票号码', '销方名称', '购方名称', '开票日期', '金额', '税额', '价税合计', '发票状态', '是否正数发票'],
      ['SYNTHETIC', 'SYNTHETIC-IMPORT-NORMAL', supplier.name, 'Synthetic Invoice Buyer', '2026-10-02', 100, 10, 110, '正常', '是'],
      ['SYNTHETIC', 'SYNTHETIC-IMPORT-REVERSED', supplier.name, 'Synthetic Invoice Buyer', '2026-10-02', 100, 10, 110, '已红冲-全额', '是'],
      ['SYNTHETIC', 'SYNTHETIC-IMPORT-NEGATIVE', supplier.name, 'Synthetic Invoice Buyer', '2026-10-02', -100, -10, -110, '正常', '否'],
    ]), 'Synthetic');
    return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  };
  const upload = () => {
    const form = new FormData();
    form.append('file', new Blob([workbook()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'synthetic-invoices.xlsx');
    form.append('invoiceType', 'all');
    return form;
  };

  await t.test('preview/reimport preserves imported source linkage, classification and failed/repeated undo', async () => {
    let before = snapshot();
    const preview = await good('/bank-flow/invoices/import/preview', upload());
    assert.equal(preview.validRows, 3);
    assert.deepEqual(snapshot(), before, 'preview must not create a source batch or invoice');
    for (const [role, expected] of [['BOSS', 403], ['SALES', 403], ['INACTIVE', 401], ['ANONYMOUS', 401]]) {
      assert.equal((await call('/bank-flow/invoices/import', upload(), role)).status, expected);
      assert.deepEqual(snapshot(), before);
    }
    const imported = await good('/bank-flow/invoices/import', upload());
    assert.equal(imported.success, 3);
    const normal = await db.invoiceRecord.findFirst({ where: { invNo: 'SYNTHETIC-IMPORT-NORMAL' } });
    assert.equal(normal.batchId, imported.batchId);
    const target = await purchase();
    const matchBody = { entityType: 'INVOICE', entityId: normal.id, contractId: target.id, contractType: 'PURCHASE' };
    before = snapshot();
    assert.equal((await call('/finance/match', matchBody, 'BOSS')).status, 403);
    assert.equal((await call('/finance/auto-match', undefined, 'BOSS')).status, 403);
    assert.deepEqual(snapshot(), before);
    await good('/finance/match', matchBody);
    before = snapshot();
    const repeated = await good('/bank-flow/invoices/import', upload());
    assert.equal(repeated.success, 0);
    assert.equal(repeated.skipped, 3);
    assert.equal(repeated.batchId, null);
    assert.deepEqual(snapshot(), before, 'duplicate import must preserve the original batch and confirmed match');
    assert.deepEqual(await get(`/bank-flow/invoices/stats?batchId=${imported.batchId}`), { validTotal: 110, validTax: 10, validAmount: 100, validCount: 1, reversedCount: 1, totalCount: 3 });
    const undo = { entityType: 'INVOICE', entityId: normal.id };
    for (const [role, expected] of [['BOSS', 403], ['INACTIVE', 401], ['ANONYMOUS', 401]]) {
      assert.equal((await call('/finance/unmatch', undo, role)).status, expected);
      assert.deepEqual(snapshot(), before);
    }
    // Force an actual SQLite update failure, rather than mocking the service response.
    runSql(`CREATE TRIGGER synthetic_invoice_undo_failure BEFORE UPDATE ON invoice_records WHEN OLD.id='${normal.id}' AND NEW.matchStatus='PENDING' BEGIN SELECT RAISE(ABORT, 'synthetic undo failure'); END;`);
    try {
      assert.equal((await call('/finance/unmatch', undo)).status, 500);
      assert.deepEqual(snapshot(), before, 'failed undo must preserve every match/source/ledger field');
    } finally { runSql('DROP TRIGGER synthetic_invoice_undo_failure;'); }
    const undone = await good('/finance/unmatch', undo);
    assert.equal(undone.matchStatus, 'PENDING');
    for (const field of ['matchedContractId', 'matchedContractType', 'matchScore', 'matchedAt']) assert.equal(undone[field], null);
    before = snapshot();
    await good('/finance/unmatch', undo);
    assert.deepEqual(snapshot(), before, 'repeated undo does not recreate or change any source/ledger rows');
    for (const role of ['ADMIN', 'FINANCE', 'SALES', 'PURCHASE', 'WAREHOUSE']) {
      await good('/finance/match', matchBody, role);
      await good('/finance/unmatch', undo, role);
    }
    assert.equal((await db.invoiceRecord.findUnique({ where: { id: normal.id } })).batchId, imported.batchId);
  });

  await t.test('nonexistent, wrong-type and cancelled invoice targets reject without changing a confirmed source', async () => {
    const originalTarget = await purchase();
    const cancelled = await purchase({ status: 'CANCELLED' });
    // This is the same contract selector used by the existing manual-link UI.
    const selectable = await get('/finance/contracts-for-match?contractType=PURCHASE');
    assert.ok(selectable.some(row => row.id === originalTarget.id));
    assert.equal(selectable.some(row => row.id === cancelled.id), false);
    const source = await invoice();
    await good('/finance/match', { entityType: 'INVOICE', entityId: source.id, contractId: originalTarget.id, contractType: 'PURCHASE' });
    const before = snapshot();
    const failures = [];
    for (const target of [
      { contractId: 'missing-synthetic-contract', contractType: 'PURCHASE' },
      { contractId: originalTarget.id, contractType: 'SALES' },
      { contractId: cancelled.id, contractType: 'PURCHASE' },
    ]) {
      const response = await call('/finance/match', { entityType: 'INVOICE', entityId: source.id, ...target });
      if (response.status !== 400 || JSON.stringify(snapshot()) !== JSON.stringify(before)) failures.push({ ...target, status: response.status, source: snapshot().invoice_records.find(row => row.id === source.id) });
    }
    assert.deepEqual(failures, [], 'invalid target must not replace the existing invoice linkage');
    const sale = await db.salesContract.create({ data: { contractNo: 'EXP-SYNTHETIC-INVOICE-MANUAL', totalAmount: 110, exchangeRate: 7, status: 'SHIPPED' } });
    const confirmed = await good('/finance/match', { entityType: 'INVOICE', entityId: source.id, contractId: sale.id, contractType: 'SALES' });
    assert.equal(confirmed.matchedContractId, sale.id);
    assert.equal(confirmed.matchedContractType, 'SALES');
    assert.equal(confirmed.batchId, source.batchId);
  });

  await t.test('stale auto-match cannot overwrite a newer manual confirmation or ignored invoice', async () => {
    const automatic = await purchase({ totalAmount: 221, supplierId: (await db.supplier.create({ data: { name: 'Synthetic Race Invoice Supplier' } })).id });
    const manual = await purchase({ totalAmount: 331 });
    const raceFields = { seller: 'Synthetic Race Invoice Supplier', amount: 201, tax: 20, total: 221 };
    const child = fork(path.join(__dirname, 'helpers/invoice-match-race-worker.cjs'), [], { env: { ...process.env, TZ: 'UTC' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    child.stdout.on('data', () => {});
    child.stderr.on('data', chunk => process.stderr.write(chunk));
    const queue = [], waits = [];
    child.on('message', message => {
      const index = waits.findIndex(wait => wait.type === message.type);
      if (index === -1) queue.push(message); else waits.splice(index, 1)[0].resolve(message);
    });
    const receive = type => {
      const index = queue.findIndex(message => message.type === type);
      if (index !== -1) return Promise.resolve(queue.splice(index, 1)[0]);
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`worker did not send ${type}`)), 12000);
        waits.push({ type, resolve: message => { clearTimeout(timeout); resolve(message); } });
      });
    };
    worker = { child, receive };
    worker.base = `http://127.0.0.1:${(await receive('ready')).port}/api/v1`;
    const failures = [];
    // Clear earlier pending fixtures through the existing ignore path so the gated
    // candidate list contains exactly the synthetic invoice under examination.
    for (const row of await db.invoiceRecord.findMany({ where: { matchStatus: 'PENDING' } })) await good('/finance/ignore', { entityType: 'INVOICE', entityId: row.id });
    for (const action of ['match', 'ignore']) {
      const source = await invoice(raceFields);
      child.send({ type: 'arm', invoiceId: source.id }); await receive('armed');
      const stale = call('/finance/auto-match', undefined, 'FINANCE', worker.base);
      await receive('gated');
      await good(`/finance/${action}`, { entityType: 'INVOICE', entityId: source.id, ...(action === 'match' ? { contractId: manual.id, contractType: 'PURCHASE' } : {}) });
      const before = snapshot();
      child.send({ type: 'release' });
      const response = await stale;
      const row = snapshot().invoice_records.find(item => item.id === source.id);
      if (response.status !== 200 || response.body.data.invoiceMatched !== 0 || JSON.stringify(snapshot()) !== JSON.stringify(before)) failures.push({ action, status: response.status, invoiceMatched: response.body.data?.invoiceMatched, state: row.matchStatus, contractId: row.matchedContractId, automaticContractId: automatic.id });
    }
    assert.deepEqual(failures, [], 'PENDING-only auto-match must recheck state at the actual write');
    const source = await invoice(raceFields);
    const before = snapshot();
    const matched = await good('/finance/auto-match');
    assert.equal(matched.invoiceMatched, 1, 'a current pending invoice still follows the existing score threshold');
    assert.equal(matched.details.invoices[0].contractId, automatic.id);
    assert.equal(matched.details.invoices[0].score, 100);
    const after = snapshot();
    assert.equal(after.invoice_records.find(row => row.id === source.id).matchStatus, 'MATCHED');
    for (const table of Object.keys(before).filter(table => table !== 'invoice_records')) assert.deepEqual(after[table], before[table], `invoice matching must not adjust ${table}`);
    assert.equal((await good('/finance/auto-match')).invoiceMatched, 0);
    assert.deepEqual(snapshot(), after, 'repeated auto-match preserves the confirmed source');
  });
  assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
  assert.equal(fs.statSync(database).mode & 0o777, 0o600);
});
