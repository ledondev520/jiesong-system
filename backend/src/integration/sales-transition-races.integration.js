/**
 * Input: Prisma schema and two actual HTTP processes sharing private synthetic SQLite
 * Output: deterministic competing lifecycle outcomes, inventory/time/ledger invariants
 * Pos: sales lifecycle concurrency regression; never reads existing business databases
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fork, execFileSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');

test('HTTP/SQLite: different concurrent sales lifecycle actions preserve invariants', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-sales-transition-races-'));
  fs.chmodSync(directory, 0o700);
  const dbFile = path.join(directory, 'synthetic.db');
  const secret = 'test-only-sales-races-secret-never-production';
  const env = { ...process.env, DATABASE_URL: `file:${dbFile}`, UPLOAD_DIR: path.join(directory, 'uploads'), NODE_ENV: 'test', JWT_SECRET: secret };
  const ddl = execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', path.resolve(__dirname, '../../prisma/schema.prisma'), '--script'], { env, encoding: 'utf8', timeout: 30000 });
  execFileSync('python3', ['-c', 'import sqlite3,sys,os; os.umask(0o077); c=sqlite3.connect(sys.argv[1]); c.executescript(sys.stdin.read()); c.close()', dbFile], { input: ddl });
  fs.chmodSync(dbFile, 0o600);
  const db = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
  const workers = [];
  t.after(async () => {
    for (const worker of workers) {
      if (!worker.child.connected) continue;
      worker.child.send({ type: 'stop' });
      await new Promise(resolve => { worker.child.once('exit', resolve); setTimeout(() => { worker.child.kill('SIGKILL'); resolve(); }, 2000).unref(); });
    }
    await db.$disconnect(); fs.rmSync(directory, { recursive: true, force: true });
  });
  const users = {};
  for (const role of ['SALES', 'WAREHOUSE']) {
    const user = await db.user.create({ data: { username: `synthetic-sales-race-${role}`, password: 'test-only-unused-hash', name: `Synthetic ${role}`, role } });
    users[role] = jwt.sign({ userId: user.id }, secret);
  }
  for (let n = 0; n < 2; n += 1) {
    const child = fork(path.join(__dirname, 'helpers/sales-race-worker.cjs'), [], { env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    const queue = [], waits = [];
    child.stdout.on('data', () => {}); child.stderr.on('data', chunk => { process.stderr.write(chunk); });
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
    const worker = { child, receive }; workers.push(worker);
    worker.base = `http://127.0.0.1:${(await receive('ready')).port}/api/v1`;
  }
  const call = async (worker, sale, action) => {
    const url = action.kind === 'payment' ? '/finance/payments'
      : `/${action.root || 'sales'}/${sale.id}${action.kind === 'header' ? '' : '/status'}`;
    const body = action.kind === 'payment'
      ? { type: 'RECEIVABLE_COLLECTION', salesContractId: sale.id, amount: 180, currency: 'USD', paymentDate: '2026-10-01' }
      : { status: action.status, ...(action.kind === 'header' ? { note: 'synthetic stale metadata' } : {}) };
    const response = await fetch(worker.base + url, {
      method: action.kind === 'payment' ? 'POST' : 'PUT',
      headers: { authorization: `Bearer ${users[action.role || 'SALES']}`, 'content-type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
    });
    const result = await response.json();
    return { status: response.status, data: result.data, message: result.message };
  };
  let sequence = 0;
  const fixture = async () => {
    sequence += 1;
    const product = await db.product.create({ data: { customsName: `SYNTHETIC RACE WIDGET ${sequence}`, unit: '件' } });
    await db.inventory.create({ data: { productId: product.id, quantity: 100, unit: '件', status: 'INBOUND', inboundAt: new Date('2026-10-01') } });
    const sale = await db.salesContract.create({ data: { contractNo: `SYNTHETIC-RACE-${sequence}`, status: 'PACKING', exchangeRate: 7.2, totalAmount: 180, totalBoxes: 5, grossWeight: 20000, volume: 5, packingItems: { create: { productId: product.id, quantity: 60, unit: '件', boxes: 5, grossWeight: 20000, netWeight: 19000, volume: 5, length: 1000, width: 1000, height: 1000, unitPrice: 3, totalPrice: 180 } } } });
    return { ...sale, productId: product.id };
  };
  // Hold the first transaction at a real query, then queue the second HTTP
  // transaction before release. SQLite serializes writers; never hold both until
  // timeout in an impossible two-reader barrier. The queued request must reread.
  const race = async (sale, actions) => {
    await Promise.all(workers.map(async (worker, index) => {
      worker.child.send({ type: 'arm', gate: actions[index].kind || 'status' });
      await worker.receive('armed');
    }));
    const first = call(workers[0], sale, actions[0]);
    await workers[0].receive('transactionRequested');
    const firstRead = await workers[0].receive('gated');
    const second = call(workers[1], sale, actions[1]);
    await workers[1].receive('transactionRequested');
    workers[0].child.send({ type: 'release' });
    const secondRead = await workers[1].receive('gated');
    workers[1].child.send({ type: 'release' });
    return { results: await Promise.all([first, second]), reads: [firstRead, secondRead] };
  };
  const status = (value, root = 'sales', role = 'SALES') => ({ status: value, root, role });
  const prepareShipped = async sale => {
    const result = await call(workers[0], sale, status('SHIPPED'));
    assert.equal(result.status, 200);
    return result.data.shippedAt;
  };
  const assertState = async (sale, expected, timestamp, paymentCount = 0) => {
    const contract = await db.salesContract.findUnique({ where: { id: sale.id } });
    const inventory = await db.inventory.findMany({ where: { productId: sale.productId } });
    const payments = await db.payment.findMany({ where: { salesContractId: sale.id } });
    const shipped = ['SHIPPED', 'ARRIVED', 'COMPLETED'].includes(expected);
    assert.equal(contract.status, expected);
    assert.equal(inventory.filter(row => row.status === 'OUTBOUND').reduce((sum, row) => sum + row.quantity, 0), shipped ? 60 : 0);
    assert.equal(inventory.filter(row => row.status === 'INBOUND').reduce((sum, row) => sum + row.quantity, 0), shipped ? 40 : 100);
    assert.equal(inventory.reduce((sum, row) => sum + row.quantity, 0), 100);
    assert.equal(Boolean(contract.shippedAt), shipped);
    if (timestamp) assert.equal(contract.shippedAt.toISOString(), timestamp);
    assert.equal(payments.length, paymentCount);
    assert.equal(contract.receivedAmount, payments.reduce((sum, payment) => sum + payment.amount, 0));
    assert.equal(contract.receivedAmount, paymentCount ? 180 : 0);
    return contract;
  };

  for (const [first, second] of [['CANCELLED', 'SHIPPED'], ['SHIPPED', 'CANCELLED']]) {
    await t.test(`${first} queued against ${second}: first valid terminal decision wins`, async () => {
      const sale = await fixture();
      const { results, reads } = await race(sale, [status(first, 'sales'), status(second, 'containers', 'WAREHOUSE')]);
      assert.deepEqual(results.map(result => result.status), [200, 400]);
      assert.deepEqual(reads.map(read => read.status), ['PACKING', first]);
      await assertState(sale, first);
    });
  }
  for (const [first, second, expected, codes] of [
    ['SHIPPED', 'ARRIVED', 'ARRIVED', [200, 200]],
    ['ARRIVED', 'SHIPPED', 'SHIPPED', [400, 200]],
    ['SHIPPED', 'COMPLETED', 'SHIPPED', [200, 400]],
    ['COMPLETED', 'SHIPPED', 'SHIPPED', [400, 200]],
  ]) {
    await t.test(`packing: ${first} versus ${second} cannot skip lifecycle evidence`, async () => {
      const sale = await fixture();
      const { results } = await race(sale, [status(first, 'containers', 'WAREHOUSE'), status(second)]);
      assert.deepEqual(results.map(result => result.status), codes);
      await assertState(sale, expected, results.find(result => result.data?.shippedAt)?.data.shippedAt);
    });
  }
  for (const [first, second, codes] of [
    ['SHIPPED', 'ARRIVED', [200, 200]],
    ['ARRIVED', 'SHIPPED', [200, 400]],
  ]) {
    await t.test(`shipped: ${first} versus ${second} keeps one allocation and timestamp`, async () => {
      const sale = await fixture();
      const timestamp = await prepareShipped(sale);
      const { results } = await race(sale, [status(first), status(second, 'containers', 'WAREHOUSE')]);
      assert.deepEqual(results.map(result => result.status), codes);
      await assertState(sale, 'ARRIVED', timestamp);
    });
  }
  for (const firstKind of ['arrival', 'payment']) {
    await t.test(`${firstKind} first: arrival and synthetic settlement converge without losing ledger`, async () => {
      const sale = await fixture();
      const timestamp = await prepareShipped(sale);
      const arrival = status('ARRIVED', 'containers', 'WAREHOUSE');
      const payment = { kind: 'payment', role: 'SALES' };
      const actions = firstKind === 'arrival' ? [arrival, payment] : [payment, arrival];
      const { results } = await race(sale, actions);
      assert.deepEqual(results.map(result => result.status), firstKind === 'arrival' ? [200, 201] : [201, 200]);
      await assertState(sale, 'COMPLETED', timestamp, 1);
    });
  }
  for (const firstKind of ['shipment', 'payment']) {
    await t.test(`${firstKind} first: shipment replay and settlement preserve pending arrival`, async () => {
      const sale = await fixture();
      const timestamp = await prepareShipped(sale);
      const shipment = status('SHIPPED', 'containers', 'WAREHOUSE');
      const payment = { kind: 'payment' };
      const actions = firstKind === 'shipment' ? [shipment, payment] : [payment, shipment];
      const { results } = await race(sale, actions);
      assert.deepEqual(results.map(result => result.status), firstKind === 'shipment' ? [200, 201] : [201, 200]);
      await assertState(sale, 'SHIPPED', timestamp, 1);
    });
  }
  for (const firstKind of ['arrival', 'payment']) {
    await t.test(`${firstKind} first: repeated arrival and receipt cannot reopen a settled contract`, async () => {
      const sale = await fixture();
      const timestamp = await prepareShipped(sale);
      assert.equal((await call(workers[0], sale, status('ARRIVED'))).status, 200);
      const arrival = status('ARRIVED', 'containers', 'WAREHOUSE');
      const payment = { kind: 'payment' };
      const actions = firstKind === 'arrival' ? [arrival, payment] : [payment, arrival];
      const { results } = await race(sale, actions);
      assert.deepEqual(results.map(result => result.status), firstKind === 'arrival' ? [200, 201] : [201, 400]);
      await assertState(sale, 'COMPLETED', timestamp, 1);
    });
  }
  for (const [first, second, codes] of [
    ['ARRIVED', 'COMPLETED', [200, 200]],
    ['COMPLETED', 'ARRIVED', [400, 200]],
  ]) {
    await t.test(`paid shipment: ${first} versus ${second} cannot bypass arrival`, async () => {
      const sale = await fixture();
      const timestamp = await prepareShipped(sale);
      assert.equal((await call(workers[0], sale, { kind: 'payment' })).status, 201);
      const { results } = await race(sale, [status(first, 'containers', 'WAREHOUSE'), status(second)]);
      assert.deepEqual(results.map(result => result.status), codes);
      await assertState(sale, 'COMPLETED', timestamp, 1);
    });
  }
  for (const root of ['sales', 'containers']) {
    await t.test(`stale ${root} PACKING request queued behind arrival cannot reverse shipment`, async () => {
      const sale = await fixture();
      const timestamp = await prepareShipped(sale);
      const { results, reads } = await race(sale, [status('ARRIVED'), status('PACKING', root, 'WAREHOUSE')]);
      assert.deepEqual(results.map(result => result.status), [200, 400]);
      assert.deepEqual(reads.map(read => read.status), ['SHIPPED', 'ARRIVED']);
      await assertState(sale, 'ARRIVED', timestamp);
    });
  }
  await t.test('stale full legacy header queued behind shipment rejects all fields atomically', async () => {
    const sale = await fixture();
    const { results, reads } = await race(sale, [status('SHIPPED'), { kind: 'header', root: 'containers', status: 'PACKING', role: 'WAREHOUSE' }]);
    assert.deepEqual(results.map(result => result.status), [200, 400]);
    assert.deepEqual(reads.map(read => read.status), ['PACKING', 'SHIPPED']);
    const contract = await assertState(sale, 'SHIPPED', results[0].data.shippedAt);
    assert.equal(contract.note, null);
  });
});
