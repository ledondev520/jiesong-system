/**
 * Input: actual Express/auth/service path and migrated private synthetic SQLite
 * Output: five bounded allocation, currency, retry/race, role and reconciliation cases
 * Pos: internal receivable ledger regression; no providers, uploads or real transfers
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, fork } = require('node:child_process');

test('HTTP/SQLite: receivable allocations preserve ledger and existing role boundaries', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-receivable-allocation-'));
  fs.chmodSync(directory, 0o700);
  const database = path.join(directory, 'synthetic.db');
  process.env.DATABASE_URL = `file:${database}`;
  process.env.UPLOAD_DIR = path.join(directory, 'uploads');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-only-receivable-secret-never-for-production';
  process.env.TZ = 'UTC';
  let db, server, worker;
  let requestNumber = 0;
  const expectedAuditRequests = new Set();
  t.after(async () => {
    if (worker?.child.connected) {
      worker.child.send({ type: 'stop' });
      await new Promise(resolve => {
        worker.child.once('exit', resolve);
        setTimeout(() => { worker.child.kill('SIGKILL'); resolve(); }, 2000).unref();
      });
    }
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    if (db && expectedAuditRequests.size) {
      const deadline = Date.now() + 5000;
      while (true) {
        const logs = await db.operationLog.findMany({ where: { requestId: { in: [...expectedAuditRequests] } }, select: { requestId: true } });
        const saved = new Set(logs.map(row => row.requestId));
        if ([...expectedAuditRequests].every(id => saved.has(id))) break;
        assert.ok(Date.now() < deadline, 'synthetic payment audit writes did not settle');
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    if (db) await db.$disconnect();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  // Apply committed migrations, rather than db push or a shared database/client rebuild.
  const migrations = path.resolve(__dirname, '../../prisma/migrations');
  const ddl = fs.readdirSync(migrations).sort()
    .filter(name => fs.statSync(path.join(migrations, name)).isDirectory())
    .map(name => fs.readFileSync(path.join(migrations, name, 'migration.sql'), 'utf8')).join('\n');
  execFileSync('python3', ['-c', 'import sqlite3,sys,os; os.umask(0o077); c=sqlite3.connect(sys.argv[1]); c.executescript(sys.stdin.read()); c.close()', database], { input: ddl });
  fs.chmodSync(database, 0o600);
  db = require('../utils/prisma');
  const jwt = require('jsonwebtoken');
  const tokens = {};
  const roles = ['ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE', 'BOSS'];
  for (const role of [...roles, 'INACTIVE']) {
    const user = await db.user.create({ data: { username: `synthetic-receivable-${role}`, password: 'test-only-unused-hash', name: `Synthetic ${role}`, role: role === 'INACTIVE' ? 'SALES' : role, isActive: role !== 'INACTIVE' } });
    // The actual database role must override this deliberately misleading JWT claim.
    tokens[role] = jwt.sign({ userId: user.id, role: 'ADMIN' }, process.env.JWT_SECRET);
  }
  const app = require('../app'); // Import does not start background jobs/provider calls.
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const call = async (method, route, body, role = 'SALES', origin = base, extraHeaders = {}) => {
    const requestId = `synthetic-receivable-request-${++requestNumber}`;
    const response = await fetch(origin + route, { method, headers: { ...(tokens[role] ? { authorization: `Bearer ${tokens[role]}` } : {}), 'content-type': 'application/json', 'x-request-id': requestId, ...extraHeaders }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (method === 'POST' && route === '/finance/payments' && [200, 201].includes(response.status)) expectedAuditRequests.add(requestId);
    return { status: response.status, body: await response.json() };
  };
  const good = async (...args) => {
    const result = await call(...args);
    assert.equal(result.status, 200, `${args[0]} ${args[1]}: ${result.body.message}`);
    return result.body.data;
  };
  let sequence = 0;
  const sale = (fields = {}) => db.salesContract.create({ data: { contractNo: `EXP-SYNTHETIC-ALLOC-${++sequence}`, totalAmount: 1000, amountSource: 'FORMAL_DOCUMENT', exchangeRate: 7, status: 'SHIPPED', ...fields } });
  const receipt = (fields = {}) => db.payment.create({ data: { type: 'RECEIVABLE_RECEIPT', amount: 100, currency: 'USD', paymentDate: new Date('2026-10-01T00:00:00Z'), customerName: 'Synthetic allocation customer', paymentMethod: 'wire', ...fields } });
  // Read persisted facts through an independent, read-only SQLite connection.
  const snapshot = () => JSON.parse(execFileSync('python3', ['-c', `import sqlite3,sys,json
c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True)
c.row_factory=sqlite3.Row
tables=['payments','sales_contracts','bank_transactions','general_ledger_entries','financial_periods','balance_sheet_entries']
print(json.dumps({table:[dict(row) for row in c.execute('SELECT * FROM '+table+' ORDER BY id')] for table in tables}))
c.close()`, database], { encoding: 'utf8', timeout: 10000 }));
  const rowsFor = id => snapshot().payments.filter(row => row.sourcePaymentId === id);
  const allocated = id => rowsFor(id).reduce((sum, row) => sum + row.amount, 0);
  const balance = id => snapshot().sales_contracts.find(row => row.id === id).receivedAmount;

  await t.test('USD split, partial remainder and historical currency spelling reach persisted contract ledgers', async () => {
    const a = await sale(), b = await sale();
    const source = await receipt();
    const allocations = [{ salesContractId: a.id, amount: 40 }, { salesContractId: b.id, amount: 25 }];
    await good('POST', `/finance/payments/${source.id}/allocate`, { allocations });
    assert.equal(balance(a.id), 40);
    assert.equal(balance(b.id), 25);
    const pool = await good('GET', '/finance/unallocated-payments');
    assert.equal(pool.find(row => row.id === source.id).remainingAmount, 35);
    for (const row of rowsFor(source.id)) {
      assert.equal(row.type, 'RECEIVABLE_COLLECTION');
      assert.equal(row.currency, 'USD');
      assert.equal(row.customerName, source.customerName);
      assert.equal(row.paymentDate, Date.parse('2026-10-01T00:00:00Z'));
    }
    const list = await good('GET', `/finance/receivables?search=${a.contractNo}`);
    assert.equal(list.items[0].receivedAmount, 40);
    assert.equal(list.items[0].unreceiveAmount, 960);
    await good('POST', `/finance/payments/${source.id}/allocate`, { allocations: [{ salesContractId: b.id, amount: 35 }] }, 'FINANCE');
    assert.equal(allocated(source.id), 100);
    assert.equal(balance(b.id), 60);
    assert.equal(snapshot().payments.find(row => row.id === source.id).type, 'RECEIVABLE_RECEIPT_ALLOCATED');
    assert.equal((await good('GET', '/finance/unallocated-payments')).some(row => row.id === source.id), false);
    const legacy = await receipt({ type: 'INCOME', currency: ' usd ' });
    await good('POST', `/finance/payments/${legacy.id}/allocate`, { allocations: [{ salesContractId: a.id, amount: 10 }] });
    assert.equal(balance(a.id), 50, 'accepted legacy USD spelling must contribute to the USD ledger');
    assert.equal(rowsFor(legacy.id)[0].currency, 'USD');
    const automaticTarget = await sale({ contractNo: 'EXP269006', totalAmount: 40 });
    const automaticSource = await receipt({ note: 'EXP269006 synthetic remaining receipt' });
    await good('POST', `/finance/payments/${automaticSource.id}/allocate`, { allocations: [{ salesContractId: b.id, amount: 60 }] });
    const match = await good('POST', '/finance/payments/auto-match', undefined, 'FINANCE');
    assert.equal(match.matchedCount, 1);
    assert.equal(match.matched[0].amount, 40, 'auto-match records remaining allocation rather than original source amount');
    assert.equal(match.matched[0].salesContractId, automaticTarget.id);
    assert.equal(balance(automaticTarget.id), 40);
    assert.equal(allocated(automaticSource.id), 100);
    const ordinary = await call('POST', '/finance/payments', { type: 'RECEIVABLE_RECEIPT', amount: 5, currency: 'USD', paymentDate: '2026-10-01' });
    assert.equal(ordinary.status, 201, 'ordinary unlinked receipt creation remains supported');
    const direct = { type: 'RECEIVABLE_COLLECTION', salesContractId: a.id, amount: 5, currency: 'USD', paymentDate: '2026-10-01' };
    const headers = { 'X-Idempotency-Key': 'synthetic-ordinary-receivable-collection' };
    const created = await call('POST', '/finance/payments', direct, 'SALES', base, headers);
    const retry = await call('POST', '/finance/payments', direct, 'SALES', base, headers);
    assert.equal(created.status, 201, 'ordinary direct collection creation remains supported');
    assert.equal(retry.status, 200);
    assert.equal(retry.body.data.id, created.body.data.id);
    assert.equal(balance(a.id), 55, 'ordinary keyed collection retry does not double the contract ledger');
  });

  await t.test('invalid split lines, linked sources, other currencies and over-allocation reject atomically', async () => {
    const a = await sale(), b = await sale();
    const invalid = [
      [{ salesContractId: a.id, amount: 110 }, { salesContractId: b.id, amount: -10 }],
      [{ salesContractId: a.id, amount: 10 }, { salesContractId: b.id, amount: 0 }],
      [{ salesContractId: a.id, amount: '10' }],
      [{ amount: 10 }],
      [{ salesContractId: 'missing-synthetic-sale', amount: 10 }],
      [{ salesContractId: a.id, amount: 101 }],
    ];
    const failures = [];
    for (const allocations of invalid) {
      const source = await receipt();
      const before = snapshot();
      const result = await call('POST', `/finance/payments/${source.id}/allocate`, { allocations });
      if (result.status !== 400 || JSON.stringify(snapshot()) !== JSON.stringify(before)) failures.push({ allocations, status: result.status, allocated: allocated(source.id), aBalance: balance(a.id), bBalance: balance(b.id) });
    }
    for (const fields of [{ currency: 'CNY' }, { type: 'INCOME', salesContractId: a.id }, { amount: 0 }, { amount: -100 }]) {
      const source = await receipt(fields), before = snapshot();
      const result = await call('POST', `/finance/payments/${source.id}/allocate`, { allocations: [{ salesContractId: b.id, amount: 0.005 }] });
      if (result.status !== 400 || JSON.stringify(snapshot()) !== JSON.stringify(before)) failures.push({ fields, status: result.status, allocated: allocated(source.id) });
    }
    const bypassSource = await receipt(), beforeBypass = snapshot();
    const bypass = await call('POST', '/finance/payments', { type: 'RECEIVABLE_COLLECTION', sourcePaymentId: bypassSource.id, salesContractId: a.id, amount: 101, currency: 'USD', paymentDate: '2026-10-01' });
    if (bypass.status !== 400 || JSON.stringify(snapshot()) !== JSON.stringify(beforeBypass)) failures.push({ bypass: true, status: bypass.status, allocated: allocated(bypassSource.id) });
    assert.deepEqual(failures, [], `invalid allocations changed persisted ledger: ${JSON.stringify(failures)}`);
  });

  await t.test('stale competing allocation cannot exceed receipt and a finished receipt replay stays rejected', async () => {
    const a = await sale(), source = await receipt();
    const child = fork(path.join(__dirname, 'helpers/receivable-race-worker.cjs'), [], { env: { ...process.env, TZ: 'UTC' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
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
    child.send({ type: 'arm' }); await receive('armed');
    const stale = call('POST', `/finance/payments/${source.id}/allocate`, { allocations: [{ salesContractId: a.id, amount: 60 }] }, 'SALES', worker.base);
    await receive('gated');
    await good('POST', `/finance/payments/${source.id}/allocate`, { allocations: [{ salesContractId: a.id, amount: 80 }] }, 'FINANCE');
    const before = snapshot();
    child.send({ type: 'release' });
    const result = await stale;
    const raceEvidence = { status: result.status, allocated: allocated(source.id), contractReceived: balance(a.id) };
    assert.deepEqual(raceEvidence, { status: 400, allocated: 80, contractReceived: 80 });
    assert.deepEqual(snapshot(), before);
    await good('POST', `/finance/payments/${source.id}/allocate`, { allocations: [{ salesContractId: a.id, amount: 20 }] });
    const finished = snapshot();
    const replay = await call('POST', `/finance/payments/${source.id}/allocate`, { allocations: [{ salesContractId: a.id, amount: 20 }] });
    assert.equal(replay.status, 400);
    assert.deepEqual(snapshot(), finished);
    // Historical source types may predate the fully-allocated marker. A positive
    // receipt with zero available balance cannot use the cent tolerance as funds.
    const legacySale = await sale({ receivedAmount: 100 });
    const legacySource = await receipt();
    await db.payment.create({ data: { type: 'RECEIVABLE_COLLECTION', sourcePaymentId: legacySource.id, salesContractId: legacySale.id, amount: 100, currency: 'USD', paymentDate: legacySource.paymentDate } });
    const legacyFinished = snapshot();
    const legacyReplay = await call('POST', `/finance/payments/${legacySource.id}/allocate`, { allocations: [{ salesContractId: legacySale.id, amount: 0.005 }] });
    assert.equal(legacyReplay.status, 400, 'zero remaining balance rejects even a sub-cent historical replay');
    assert.deepEqual(snapshot(), legacyFinished);
    // No new allocation idempotency/undo operation is assumed: the existing endpoint rejects a spent source.
  });

  await t.test('current database roles permit ordinary allocation but deny BOSS, inactive and anonymous writes', async () => {
    const a = await sale(), source = await receipt();
    for (const role of roles.filter(role => role !== 'BOSS')) {
      await good('POST', `/finance/payments/${source.id}/allocate`, { allocations: [{ salesContractId: a.id, amount: 1 }] }, role);
    }
    for (const [role, expected] of [['BOSS', 403], ['INACTIVE', 401], ['ANONYMOUS', 401]]) {
      const before = snapshot();
      assert.equal((await call('POST', `/finance/payments/${source.id}/allocate`, { allocations: [{ salesContractId: a.id, amount: 1 }] }, role)).status, expected);
      assert.deepEqual(snapshot(), before);
    }
    assert.equal(balance(a.id), 5);
    for (const role of ['SALES', 'FINANCE', 'BOSS']) {
      assert.equal((await good('GET', '/finance/unallocated-payments', undefined, role)).find(row => row.id === source.id).remainingAmount, 95);
      assert.equal((await good('GET', `/finance/payments?salesContractId=${a.id}`, undefined, role)).items.length, 5);
    }
  });

  await t.test('known-difference reconciliation uses cutoff/currency rules and ADMIN/FINANCE/BOSS read access', async () => {
    const period = await db.financialPeriod.create({ data: { year: 2026, month: 9, periodLabel: 'Synthetic September', reportDate: new Date('2026-09-30T00:00:00Z'), balanceSheet: { create: { accountsReceivable: 900 } } } });
    for (const fields of [
      { contractNo: 'EXP269001', totalAmount: 100, shippedAt: new Date('2026-09-02T00:00:00Z') },
      { contractNo: 'EXP269002', totalAmount: 50, shippedAt: new Date('2026-09-03T00:00:00Z') },
      { contractNo: 'EXP269003', totalAmount: 1000, shippedAt: new Date('2026-10-01T00:00:00Z') },
      { contractNo: 'EXP269004', totalAmount: 1000, shippedAt: new Date('2026-09-03T00:00:00Z'), status: 'CANCELLED' },
      { contractNo: 'EXP269005', totalAmount: 1000, shippedAt: new Date('2026-09-03T00:00:00Z'), amountSource: 'DERIVED' },
    ]) await sale(fields);
    const batch = await db.financeDataBatch.create({ data: { type: 'BANK_FLOW', fileName: 'synthetic-only', recordCount: 5 } });
    for (const [amount, fields] of [[40, {}], [1000, { currency: 'CNY' }], [1000, { direction: 'OUT' }], [1000, { counterpart: 'Synthetic other customer' }], [1000, { txnDate: '2026-10-01' }]]) {
      await db.bankTransaction.create({ data: { batchId: batch.id, currency: 'USD', direction: 'IN', txnTime: '2026-09-03 12:00:00', txnDate: '2026-09-03', amount, counterpart: 'SP FOOD SYNTHETIC', ...fields } });
    }
    for (let sourceRow = 1; sourceRow <= 2; sourceRow += 1) {
      await db.generalLedgerEntry.create({ data: { periodId: period.id, sourceRow, rowType: 'DETAIL', accountCode: '1122', accountName: 'Synthetic receivables', entryDate: new Date('2026-09-02T00:00:00Z'), summary: 'EXP269001 synthetic income', debit: 700, credit: 0, voucherNumber: `synthetic-${sourceRow}` } });
    }
    const before = snapshot();
    const route = '/finance/receivable-reconciliation?year=2026&month=9';
    for (const role of ['ADMIN', 'FINANCE', 'BOSS']) {
      const result = await good('GET', route, undefined, role);
      assert.equal(result.cutoffDate, '2026-09-30');
      assert.equal(result.contractCount, 2);
      assert.equal(result.formalSalesUsd, 150);
      assert.equal(result.receivedUsd, 40);
      assert.equal(result.operatingReceivableUsd, 110);
      assert.equal(result.effectiveExchangeRate, 7);
      assert.equal(result.anomalies.duplicateDebitCny, 700);
      assert.equal(result.anomalies.missingDebitCny, 350);
      assert.deepEqual(result.anomalies.missingContracts, [{ contractNo: 'EXP269002', amountUsd: 50, estimatedAmountCny: 350 }]);
      assert.equal(result.correctedAccountingReceivableCny, 550);
      assert.equal(result.translatedOperatingReceivableCny, 770);
      assert.equal(result.residualCny, -220);
    }
    for (const role of ['SALES', 'PURCHASE', 'WAREHOUSE']) assert.equal((await call('GET', route, undefined, role)).status, 403);
    assert.equal(await good('GET', '/finance/receivable-reconciliation?year=2026&month=8', undefined, 'FINANCE'), null);
    assert.deepEqual(snapshot(), before, 'reconciliation GET must not change any evidence or ledger rows');
  });
  assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
  assert.equal(fs.statSync(database).mode & 0o777, 0o600);
});
