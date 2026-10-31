/** Quotes over HTTP on a private SQLite built from the committed migrations: pricing on save, state transitions,
 *  convert-to-order transaction, concurrency, roles and BOSS read-only. Synthetic data only. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('quote service over HTTP', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-quotes-'));
  fs.chmodSync(directory, 0o700);
  const database = path.join(directory, 'synthetic.db');
  process.env.DATABASE_URL = `file:${database}`;
  process.env.UPLOAD_DIR = path.join(directory, 'uploads');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-only-quotes-fixture-never-for-production';
  process.env.TZ = 'UTC';
  const previousPricingPath = process.env.JIESONG_PRICING_CONFIG;
  const pricingFile = path.join(directory, 'pricing.json');
  process.env.JIESONG_PRICING_CONFIG = pricingFile;
  const originalUmask = process.umask(0o022);
  let db, server;
  t.after(async () => {
    if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
    if (db) await db.$disconnect();
    fs.rmSync(directory, { recursive: true, force: true });
    process.umask(originalUmask);
    if (previousPricingPath === undefined) delete process.env.JIESONG_PRICING_CONFIG;
    else process.env.JIESONG_PRICING_CONFIG = previousPricingPath;
  });
  require('../testHelpers/financial-library-data').applyMigrations(database);
  db = require('../utils/prisma');

  const tileCategory = await db.productCategory.create({ data: { name: 'Synthetic tiles' } });
  fs.writeFileSync(pricingFile, JSON.stringify({
    exchangeRate: 6.72, exchangeAdjustment: -0.2, defaultMarkup: 0.3, roundUpTo: 5,
    categoryMarkups: [{ categoryId: tileCategory.id, categoryName: 'Synthetic tiles', markup: 0.1 }],
  }), { mode: 0o600 });
  const port = await db.port.create({ data: { name: 'Synthetic port', code: 'SYN-P' } });
  const customer = await db.customer.create({ data: { name: 'Synthetic customer', defaultPaymentTerms: 'T/T 30%', defaultPortOfLoading: 'Shanghai' } });
  const [storeA, storeB] = await Promise.all(['A', 'B'].map((n) => db.store.create({ data: { name: `Synthetic store ${n}`, portId: port.id } })));
  const normal = await db.product.create({ data: { customsName: 'Synthetic normal good', unit: 'PCS' } });
  const tile = await db.product.create({ data: { customsName: 'Synthetic tile', categoryId: tileCategory.id } });

  const tokenFor = async (role) => {
    const user = await db.user.create({ data: { username: `synthetic-${role.toLowerCase()}`, name: role, password: 'unused-hash', role } });
    return { id: user.id, token: require('jsonwebtoken').sign({ userId: user.id }, process.env.JWT_SECRET) };
  };
  const roles = {};
  for (const role of ['ADMIN', 'SALES', 'PURCHASE', 'FINANCE', 'WAREHOUSE', 'BOSS']) roles[role] = await tokenFor(role);
  const app = require('../app');
  server = await new Promise((resolve) => { const l = app.listen(0, '127.0.0.1', () => resolve(l)); });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const call = async (role, method, route, body) => {
    const response = await fetch(base + route, {
      method,
      headers: { ...(role ? { authorization: `Bearer ${roles[role].token}` } : {}), 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, ...(await response.json().catch(() => ({}))) };
  };
  const ok = async (...args) => { const r = await call(...args); assert.equal(r.status, 200, `${args[1]} ${args[2]}: ${r.message}`); return r.data; };
  const line = (extra = {}) => ({ productId: normal.id, storeId: storeA.id, quantity: 10, costCny: 10000, ...extra });

  await t.test('prices only with the one rule; defaults customer terms; client formulaPrice is ignored', async () => {
    const quote = await ok('SALES', 'POST', '/quotes', { items: [
      line({ formulaPrice: 1 }),                                                     // owner example: 10000 ¥ at spot 6.72 → 1995
      line({ productId: tile.id, storeId: storeB.id, quantity: 2 }),                 // tile ×1.1: 11000 / 6.52 = 1687.12 → 1688 → 1690
      line({ costCny: null }),                                                       // 缺成本
      line({ costCny: 10000, isManualPrice: true, unitPrice: 2500.5 }),              // manual override kept
    ] });
    assert.match(quote.quoteNo, /^QT\d{4}-001$/);
    assert.equal(quote.status, 'DRAFT');
    assert.equal(quote.customerId, customer.id);
    assert.equal(quote.incoterm, 'FOB');
    assert.equal(quote.paymentTerms, 'T/T 30%');
    assert.equal(quote.portOfLoading, 'Shanghai');
    assert.equal(quote.spotRate, 6.72);
    assert.equal(quote.pricingRate, 6.52);
    assert.match(quote.pricingRevision, /^[0-9a-f]{64}$/);
    const [a, b, c, d] = quote.items;
    assert.deepEqual([a.formulaPrice, a.unitPrice, a.totalPrice, a.markup, a.isManualPrice], [1995, 1995, 19950, 0.3, false]);
    assert.deepEqual([b.formulaPrice, b.unitPrice, b.markup], [1690, 1690, 0.1]);
    assert.deepEqual([c.formulaPrice, c.unitPrice, c.markup], [null, 0, null]);
    assert.deepEqual([d.formulaPrice, d.unitPrice, d.isManualPrice, d.totalPrice], [1995, 2500.5, true, 25005]);
    assert.equal(quote.totalAmount, 19950 + 3380 + 0 + 25005);
    assert.equal(a.unit, 'PCS'); // defaulted from the product
    assert.equal((await ok('SALES', 'POST', '/quotes', {})).quoteNo.endsWith('-002'), true);
  });

  await t.test('changing the spot rate reprices; invalid input is atomic', async () => {
    const quote = await ok('SALES', 'POST', '/quotes', { items: [line()] });
    const repriced = await ok('SALES', 'PUT', `/quotes/${quote.id}`, { spotRate: 7.2 }); // 13000 / 7.0 = 1857.14 → 1858 → 1860
    assert.equal(repriced.pricingRate, 7);
    assert.equal(repriced.items[0].unitPrice, 1860);
    const before = await db.quote.count();
    for (const body of [{ items: [line({ quantity: 0 })] }, { items: [line({ productId: 'missing' })] }, { items: [line({ storeId: 'missing' })] },
      { items: [line({ isManualPrice: true })] }, { spotRate: -1 }]) {
      assert.equal((await call('SALES', 'PUT', `/quotes/${quote.id}`, body)).status, 400, JSON.stringify(body));
    }
    assert.equal((await call('SALES', 'POST', '/quotes', { items: [line({ quantity: -1 })] })).status, 400);
    assert.equal(await db.quote.count(), before);
    assert.equal((await ok('SALES', 'GET', `/quotes/${quote.id}`)).items[0].unitPrice, 1860);
  });

  await t.test('send guard, DRAFT-only edits, reopen, cancel and terminal states', async () => {
    const incomplete = await ok('SALES', 'POST', '/quotes', { items: [line({ storeId: null })] });
    assert.equal((await call('SALES', 'PUT', `/quotes/${incomplete.id}`, { status: 'SENT' })).status, 400);
    const quote = await ok('SALES', 'POST', '/quotes', { items: [line()] });
    const sent = await ok('SALES', 'PUT', `/quotes/${quote.id}`, { status: 'SENT' });
    assert.equal(sent.status, 'SENT');
    assert.ok(sent.sentAt);
    assert.equal((await call('SALES', 'PUT', `/quotes/${quote.id}`, { note: 'late edit' })).status, 400);
    assert.equal((await call('SALES', 'PUT', `/quotes/${quote.id}`, { items: [line()] })).status, 400);
    const reopened = await ok('SALES', 'PUT', `/quotes/${quote.id}`, { status: 'DRAFT' });
    assert.equal(reopened.sentAt, null);
    assert.equal((await ok('SALES', 'PUT', `/quotes/${quote.id}`, { note: 'ok again' })).note, 'ok again');
    assert.equal((await call('SALES', 'PUT', `/quotes/${quote.id}`, { status: 'ACCEPTED' })).status, 400);
    await ok('SALES', 'PUT', `/quotes/${quote.id}`, { status: 'CANCELLED' });
    for (const status of ['DRAFT', 'SENT', 'ACCEPTED', 'CONVERTED']) {
      assert.equal((await call('SALES', 'PUT', `/quotes/${quote.id}`, { status })).status, 400, status);
    }
    const rejected = await ok('SALES', 'POST', '/quotes', { items: [line()] });
    await ok('SALES', 'PUT', `/quotes/${rejected.id}`, { status: 'SENT' });
    assert.equal((await ok('SALES', 'PUT', `/quotes/${rejected.id}`, { status: 'REJECTED' })).status, 'REJECTED');
    assert.equal((await call('SALES', 'DELETE', `/quotes/${quote.id}`)).status, 404); // no delete route
  });

  const acceptedQuote = async (items = [line(), line({ productId: tile.id, storeId: storeB.id, quantity: 2 })]) => {
    const quote = await ok('SALES', 'POST', '/quotes', { items });
    await ok('SALES', 'PUT', `/quotes/${quote.id}`, { status: 'SENT' });
    await ok('SALES', 'PUT', `/quotes/${quote.id}`, { status: 'ACCEPTED' });
    return quote;
  };

  await t.test('convert creates one DRAFT order with items; a second conversion is refused', async () => {
    const quote = await acceptedQuote();
    const converted = await ok('SALES', 'PUT', `/quotes/${quote.id}`, { status: 'CONVERTED' });
    assert.equal(converted.status, 'CONVERTED');
    const order = await db.salesContract.findUnique({ where: { id: converted.convertedOrder.id }, include: { items: true } });
    assert.equal(order.quoteId, quote.id);
    assert.equal(order.status, 'DRAFT');
    assert.equal(order.customerId, customer.id);
    assert.equal([order.currency, order.incoterm, order.paymentTerms, order.portOfLoading].join('|'), 'USD|FOB|T/T 30%|Shanghai');
    assert.equal(order.exchangeRate, 6.72);       // the order keeps the spot rate, not spot − 0.2
    assert.equal(order.portId, port.id);          // both stores share one destination port
    assert.equal(order.totalAmount, 19950 + 3380);
    assert.equal(order.items.length, 2);
    const item = order.items.find((i) => i.productId === normal.id);
    assert.deepEqual([item.storeId, item.quantity, item.costPrice, item.sellingPrice], [storeA.id, 10, 10000, 1995]);
    assert.equal((await call('SALES', 'PUT', `/quotes/${quote.id}`, { status: 'CONVERTED' })).status, 400);
    assert.equal(await db.salesContract.count({ where: { quoteId: quote.id } }), 1);
  });

  await t.test('concurrent conversions create exactly one order', async () => {
    const quote = await acceptedQuote([line()]);
    const results = await Promise.all([1, 2, 3].map(() => call('SALES', 'PUT', `/quotes/${quote.id}`, { status: 'CONVERTED' })));
    assert.equal(results.filter((r) => r.status === 200).length, 1, JSON.stringify(results.map((r) => r.status)));
    assert.ok(results.filter((r) => r.status !== 200).every((r) => [400, 409].includes(r.status)));
    assert.equal(await db.salesContract.count({ where: { quoteId: quote.id } }), 1);
  });

  await t.test('a failed conversion rolls everything back', async () => {
    const quote = await acceptedQuote([line()]);
    const year = new Date().getFullYear();
    const taken = await db.salesContract.count({ where: { contractNo: { startsWith: `EXP${year}` } } });
    // The generator uses count+1; inserting one row shifts the count, so occupy taken+2 to collide → unique violation → 409.
    await db.salesContract.create({ data: { contractNo: `EXP${year}${String(taken + 2).padStart(5, '0')}`, exchangeRate: 7 } });
    const result = await call('SALES', 'PUT', `/quotes/${quote.id}`, { status: 'CONVERTED' });
    assert.equal(result.status, 409);
    assert.equal((await db.quote.findUnique({ where: { id: quote.id } })).status, 'ACCEPTED');
    assert.equal(await db.salesContract.count({ where: { quoteId: quote.id } }), 0);
    assert.equal(await db.salesItem.count({ where: { productId: normal.id, salesContract: { quoteId: quote.id } } }), 0);
  });

  await t.test('copy creates a new DRAFT, keeps manual prices and reprices the rest', async () => {
    const source = await ok('SALES', 'POST', '/quotes', { items: [line(), line({ isManualPrice: true, unitPrice: 2500.5 })] });
    await ok('SALES', 'PUT', `/quotes/${source.id}`, { status: 'CANCELLED' });
    const copy = await ok('SALES', 'POST', '/quotes', { copyFromQuoteId: source.id });
    assert.notEqual(copy.id, source.id);
    assert.notEqual(copy.quoteNo, source.quoteNo);
    assert.equal(copy.status, 'DRAFT');
    assert.deepEqual(copy.items.map((i) => [i.unitPrice, i.isManualPrice]), [[1995, false], [2500.5, true]]);
  });

  await t.test('list filters by keyword and status; detail reports expiry as computed', async () => {
    const quote = await ok('SALES', 'POST', '/quotes', { note: 'Synthetic list marker', validUntil: '2020-01-01', items: [line()] });
    await ok('SALES', 'PUT', `/quotes/${quote.id}`, { status: 'SENT' });
    const list = await ok('SALES', 'GET', '/quotes?keyword=Synthetic%20list%20marker&status=sent&page=1&pageSize=20');
    assert.deepEqual(list.items.map((r) => r.id), [quote.id]);
    assert.equal(list.items[0].isExpired, true);
    assert.equal((await ok('SALES', 'GET', `/quotes/${quote.id}`)).isExpired, true);
    assert.equal((await ok('SALES', 'GET', '/quotes?keyword=zzz-no-match')).items.length, 0);
  });

  await t.test('export.xlsx and print view are streamed, role-limited and never stored', async () => {
    const quote = await ok('SALES', 'POST', '/quotes', { items: [line(), line({ productId: tile.id, storeId: storeB.id, quantity: 2 })] });
    const raw = async (role, route) => fetch(base + route, { headers: { authorization: `Bearer ${roles[role].token}` } });
    for (const role of ['SALES', 'ADMIN', 'PURCHASE', 'FINANCE']) {
      const response = await raw(role, `/quotes/${quote.id}/export.xlsx`);
      assert.equal(response.status, 200, role);
      assert.match(response.headers.get('content-type'), /spreadsheetml/);
      assert.match(response.headers.get('content-disposition'), new RegExp(quote.quoteNo));
      assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0, 2).toString(), 'PK');
    }
    const html = await (await raw('SALES', `/quotes/${quote.id}/print`)).text();
    assert.ok(html.includes(quote.quoteNo));
    assert.ok(!html.includes('10000')); // no cost column
    for (const role of ['BOSS', 'WAREHOUSE']) {
      assert.equal((await raw(role, `/quotes/${quote.id}/export.xlsx`)).status, 403, role);
      assert.equal((await raw(role, `/quotes/${quote.id}/print`)).status, 403, role);
    }
    assert.equal((await raw('SALES', '/quotes/missing/export.xlsx')).status, 404);
    assert.deepEqual(fs.existsSync(process.env.UPLOAD_DIR) ? fs.readdirSync(process.env.UPLOAD_DIR) : [], []);
  });

  await t.test('roles: WAREHOUSE denied, PURCHASE/FINANCE read-only, BOSS read-only, anonymous 401', async () => {
    const quote = await ok('ADMIN', 'POST', '/quotes', { items: [line()] });
    assert.equal((await call(null, 'GET', '/quotes')).status, 401);
    assert.equal((await call('WAREHOUSE', 'GET', '/quotes')).status, 403);
    assert.equal((await call('WAREHOUSE', 'GET', `/quotes/${quote.id}`)).status, 403);
    for (const role of ['PURCHASE', 'FINANCE', 'BOSS']) {
      assert.equal((await call(role, 'GET', '/quotes')).status, 200, role);
      const detail = await call(role, 'GET', `/quotes/${quote.id}`);
      assert.equal(detail.status, 200, role);
      assert.equal(detail.data.items[0].costCny, 10000);
      assert.equal((await call(role, 'POST', '/quotes', {})).status, 403, role);
      assert.equal((await call(role, 'PUT', `/quotes/${quote.id}`, { note: 'x' })).status, 403, role);
    }
    assert.equal((await call('WAREHOUSE', 'POST', '/quotes', {})).status, 403);
    assert.equal((await call('ADMIN', 'PUT', `/quotes/${quote.id}`, { note: 'admin edit' })).status, 200);
    assert.equal((await db.quote.findUnique({ where: { id: quote.id } })).createdById, roles.ADMIN.id);
  });
});
