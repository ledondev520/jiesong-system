/** Last owner-confirmed price pre-fill (PRICING-LASTPRICE) over HTTP on a private SQLite: pricing preview, quotes and new orders.
 *  Separate from quote-lifecycle because that suite already uses most of the global 100 requests/minute limit. Synthetic data only. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('last confirmed price pre-fills repeat products; new products use the formula', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-lastprice-'));
  fs.chmodSync(directory, 0o700);
  const database = path.join(directory, 'synthetic.db');
  process.env.DATABASE_URL = `file:${database}`;
  process.env.UPLOAD_DIR = path.join(directory, 'uploads');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-only-lastprice-fixture-never-for-production';
  const previousPricingPath = process.env.JIESONG_PRICING_CONFIG;
  const pricingFile = path.join(directory, 'pricing.json');
  process.env.JIESONG_PRICING_CONFIG = pricingFile;
  let db, server;
  t.after(async () => {
    if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
    if (db) await db.$disconnect();
    fs.rmSync(directory, { recursive: true, force: true });
    if (previousPricingPath === undefined) delete process.env.JIESONG_PRICING_CONFIG;
    else process.env.JIESONG_PRICING_CONFIG = previousPricingPath;
  });
  require('../testHelpers/financial-library-data').applyMigrations(database);
  db = require('../utils/prisma');
  fs.writeFileSync(pricingFile, JSON.stringify({ exchangeRate: 6.72, exchangeAdjustment: -0.2, defaultMarkup: 0.3, categoryMarkups: [] }), { mode: 0o600 });
  const port = await db.port.create({ data: { name: 'Synthetic port', code: 'SYN-P' } });
  const customer = await db.customer.create({ data: { name: 'Synthetic customer' } });
  const storeA = await db.store.create({ data: { name: 'Synthetic store A', portId: port.id } });
  const [repeat, draftOnly, brandNew] = await Promise.all(['repeat', 'draft only', 'brand new'].map((n) => db.product.create({ data: { customsName: `Synthetic ${n}`, unit: 'PCS' } })));
  const user = await db.user.create({ data: { username: 'synthetic-sales', name: 'SALES', password: 'unused-hash', role: 'SALES' } });
  const token = require('jsonwebtoken').sign({ userId: user.id }, process.env.JWT_SECRET);
  const app = require('../app');
  server = await new Promise((resolve) => { const l = app.listen(0, '127.0.0.1', () => resolve(l)); });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const ok = async (method, route, body) => {
    const response = await fetch(base + route, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const json = await response.json().catch(() => ({}));
    assert.equal(response.status < 300, true, `${method} ${route}: ${response.status} ${json.message}`);
    return json.data;
  };
  const line = (extra = {}) => ({ productId: repeat.id, storeId: storeA.id, quantity: 10, costCny: 10000, ...extra });
  const preview = async (extra = {}) => (await ok('POST', '/pricing/preview', {
    lines: [repeat, draftOnly, brandNew].map((p) => ({ productId: p.id, costCny: 10000 })), ...extra,
  })).results.map((r) => [r.unitPriceUsd, r.source]);

  // A manual price on a DRAFT quote does not count yet; the formula applies (13000 / 6.52 = 1993.87 → 1994).
  await ok('POST', '/quotes', { items: [line({ productId: draftOnly.id, isManualPrice: true, unitPrice: 3000 })] });
  assert.deepEqual(await preview(), [[1994, 'RULE'], [1994, 'RULE'], [1994, 'RULE']]);

  // Once the quote is SENT its manual price becomes the next pre-fill; the formula price stays beside it, and the line is not "manual".
  const sentQuote = await ok('POST', '/quotes', { items: [line({ isManualPrice: true, unitPrice: 2500.5 })] });
  await ok('PUT', `/quotes/${sentQuote.id}`, { status: 'SENT' });
  assert.deepEqual(await preview(), [[2500.5, 'LAST_CONFIRMED'], [1994, 'RULE'], [1994, 'RULE']]);
  const detail = (await ok('POST', '/pricing/preview', { lines: [{ productId: repeat.id, costCny: 10000 }] })).results[0];
  assert.deepEqual([detail.formulaPriceUsd, detail.status], [1994, 'OK']);
  const next = (await ok('POST', '/quotes', { items: [line(), line({ productId: brandNew.id }), line({ isManualPrice: true, unitPrice: 1 })] })).items;
  assert.deepEqual(next.map((i) => [i.unitPrice, i.formulaPrice, i.isManualPrice]), [[2500.5, 1994, false], [1994, 1994, false], [1, 1994, true]]);
  // The document being edited is excluded from its own pre-fill.
  assert.deepEqual((await preview({ excludeQuoteId: sentQuote.id }))[0], [1994, 'RULE']);

  // An order that left DRAFT and is newer than the quote wins; DRAFT orders never count.
  const order = async (status, price) => db.salesContract.create({ data: {
    contractNo: `SYN-LP-${status}-${price}`, exchangeRate: 6.52, status, customerId: customer.id,
    items: { create: [{ productId: repeat.id, storeId: storeA.id, quantity: 1, costPrice: 10000, sellingPrice: price }] },
  } });
  await order('DRAFT', 9999);
  assert.deepEqual((await preview())[0], [2500.5, 'LAST_CONFIRMED']);
  const confirmed = await order('CONFIRMED', 2600);
  assert.deepEqual((await preview())[0], [2600, 'LAST_CONFIRMED']);
  assert.deepEqual((await preview({ excludeSalesContractId: confirmed.id }))[0], [2500.5, 'LAST_CONFIRMED']);

  // New orders: an unpriced line takes the same pre-fill server-side; an explicit price is kept.
  const created = await ok('POST', '/sales', { exchangeRate: 6.72, items: [
    { productId: repeat.id, storeId: storeA.id, quantity: 1, costPrice: 10000, unit: 'PCS' },
    { productId: brandNew.id, storeId: storeA.id, quantity: 1, costPrice: 10000, unit: 'PCS' },
    { productId: brandNew.id, storeId: storeA.id, quantity: 1, costPrice: 10000, unit: 'PCS', sellingPrice: 77 },
  ] });
  assert.deepEqual(created.items.map((i) => i.sellingPrice).sort((a, b) => a - b), [77, 1994, 2600]);
});
