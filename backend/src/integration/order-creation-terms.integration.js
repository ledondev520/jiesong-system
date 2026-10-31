/** Real HTTP/SQLite coverage for POST /sales order-level terms: customer selection, copied terms, USD only, rule-priced lines. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('HTTP/SQLite: new orders need an active customer (none → 400), adopt a single one, copy its terms and price unpriced lines by the rule', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-order-terms-'));
  fs.chmodSync(directory, 0o700);
  const database = path.join(directory, 'synthetic.db');
  process.env.DATABASE_URL = `file:${database}`;
  process.env.UPLOAD_DIR = path.join(directory, 'uploads');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-only-order-terms-never-for-production';
  let db, server;
  t.after(async () => {
    if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
    if (db) await db.$disconnect();
    delete process.env.JIESONG_PRICING_CONFIG;
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); // a trailing audit-log write can recreate files mid-delete
  });
  const migrations = path.resolve(__dirname, '../../prisma/migrations');
  const ddl = fs.readdirSync(migrations).sort()
    .filter((name) => fs.statSync(path.join(migrations, name)).isDirectory())
    .map((name) => fs.readFileSync(path.join(migrations, name, 'migration.sql'), 'utf8')).join('\n');
  execFileSync('python3', ['-c', 'import sqlite3,sys,os; os.umask(0o077); c=sqlite3.connect(sys.argv[1]); c.executescript(sys.stdin.read()); c.close()', database], { input: ddl });
  fs.chmodSync(database, 0o600);
  const pricingFile = path.join(directory, 'pricing.json');
  fs.writeFileSync(pricingFile, JSON.stringify({ ...require('../../../config/pricing.json'), exchangeRate: 6.72, exchangeAdjustment: -0.2, defaultMarkup: 0.3, roundUpTo: 5, categoryMarkups: [] }), { mode: 0o600 });
  process.env.JIESONG_PRICING_CONFIG = pricingFile;
  db = require('../utils/prisma');
  const user = await db.user.create({ data: { username: 'synthetic-terms-sales', password: 'test-only-unused-hash', name: '合成销售', role: 'SALES' } });
  const token = require('jsonwebtoken').sign({ userId: user.id }, process.env.JWT_SECRET);
  const port = await db.port.create({ data: { name: '合成条款港口', code: 'QA-TERMS' } });
  const store = await db.store.create({ data: { name: '合成条款门店', portId: port.id } });
  const product = await db.product.create({ data: { customsName: '合成条款商品', unit: '件' } });
  const app = require('../app');
  server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const create = async (body) => {
    const response = await fetch(`${base}/sales`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, ...(await response.json()) };
  };
  const line = (extra = {}) => ({ productId: product.id, storeId: store.id, quantity: 10, costPrice: 10000, unit: '件', ...extra });
  const order = (extra = {}) => ({ exchangeRate: 6.72, items: [line()], ...extra });

  // No active customer: 400 with a clear message and nothing written (DATA-MODEL §2.4).
  const none = await create(order());
  assert.equal(none.status, 400);
  assert.match(none.message, /请选择客户/);
  assert.match(none.message, /客户与门店/);
  assert.equal(await db.salesContract.count(), 0);
  const archived = await db.customer.create({ data: { name: 'Synthetic Archived', isActive: false } });
  assert.equal((await create(order())).status, 400, 'archived customers do not count as active');
  assert.equal((await create(order({ customerId: archived.id }))).status, 400, 'an archived customer cannot be selected either');
  assert.equal(await db.salesContract.count(), 0);

  // One active customer is adopted and its default terms are copied.
  const seapot = await db.customer.create({ data: { name: 'Synthetic Seapot', defaultIncoterm: 'FOB', defaultPaymentTerms: '30% deposit', defaultPortOfLoading: 'Shanghai' } });
  const adopted = await create(order());
  assert.equal(adopted.status, 201);
  assert.equal(adopted.data.customerId, seapot.id);
  assert.equal(adopted.data.currency, 'USD');
  assert.equal(adopted.data.items[0].sellingPrice, 1995, '¥10,000 → 1993.87 → 1994 → 1995 by the locked rule');
  assert.equal(adopted.data.totalAmount, 19950);
  assert.deepEqual([adopted.data.incoterm, adopted.data.paymentTerms, adopted.data.portOfLoading], ['FOB', '30% deposit', 'Shanghai']);
  // Explicit values override the copied defaults; an explicit selling price is kept as entered.
  const explicit = await create(order({ incoterm: 'cif', paymentTerms: 'T/T', items: [line({ sellingPrice: 1234 })] }));
  assert.deepEqual([explicit.data.incoterm, explicit.data.paymentTerms, explicit.data.items[0].sellingPrice], ['CIF', 'T/T', 1234]);

  // Several active customers require a choice; archived or unknown customers and non-USD are refused.
  const other = await db.customer.create({ data: { name: 'Synthetic Other' } });
  const before = await db.salesContract.count();
  assert.equal((await create(order())).status, 400);
  assert.equal((await create(order({ customerId: other.id }))).status, 201);
  await db.customer.update({ where: { id: other.id }, data: { isActive: false } });
  assert.equal((await create(order({ customerId: other.id }))).status, 400);
  assert.equal((await create(order({ customerId: 'missing' }))).status, 400);
  assert.equal((await create(order({ currency: 'EUR' }))).status, 400);
  assert.equal((await create(order({ incoterm: 'DAP' }))).status, 400);
  assert.equal(await db.salesContract.count(), before + 1, 'only the valid explicit-customer order was written');

  // A store linked to another customer is refused; unlinked legacy stores and the owner's own stores pass (review R1-3).
  const ownStore = await db.store.create({ data: { name: 'Synthetic own store', portId: port.id, customerId: seapot.id } });
  const foreignStore = await db.store.create({ data: { name: 'Synthetic foreign store', portId: port.id, customerId: (await db.customer.create({ data: { name: 'Synthetic Third' } })).id } });
  const count = await db.salesContract.count();
  const foreign = await create(order({ customerId: seapot.id, items: [line({ storeId: foreignStore.id })] }));
  assert.equal(foreign.status, 400);
  assert.match(foreign.message, /门店不属于所选客户/);
  assert.equal(await db.salesContract.count(), count, 'nothing written for a cross-customer store');
  assert.equal((await create(order({ customerId: seapot.id, items: [line({ storeId: ownStore.id })] }))).status, 201);
  assert.equal((await create(order({ customerId: seapot.id, items: [line()] }))).status, 201, 'a legacy store with no customer link still passes');
});
