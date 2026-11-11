/**
 * A98: walks every registered GET route as a real WAREHOUSE user (HTTP + SQLite, synthetic money-bearing rows)
 * and asserts no JSON response carries a forbidden money/invoice key outside the OD-6 exemption list.
 * Routes are read from the mounted Express router, so a new route is covered without editing this file.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('HTTP/SQLite: no WAREHOUSE JSON response on any GET route carries a forbidden money or invoice key', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-wh-walk-'));
  fs.chmodSync(directory, 0o700);
  const database = path.join(directory, 'synthetic.db');
  process.env.DATABASE_URL = `file:${database}`;
  process.env.UPLOAD_DIR = path.join(directory, 'uploads');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-only-wh-walk-never-for-production';
  let db, server;
  t.after(async () => {
    if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
    if (db) await db.$disconnect();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const migrations = path.resolve(__dirname, '../../prisma/migrations');
  const ddl = fs.readdirSync(migrations).sort()
    .filter((name) => fs.statSync(path.join(migrations, name)).isDirectory())
    .map((name) => fs.readFileSync(path.join(migrations, name, 'migration.sql'), 'utf8')).join('\n');
  execFileSync('python3', ['-c', 'import sqlite3,sys,os; os.umask(0o077); c=sqlite3.connect(sys.argv[1]); c.executescript(sys.stdin.read()); c.close()', database], { input: ddl });
  fs.chmodSync(database, 0o600);
  db = require('../utils/prisma');
  const jwt = require('jsonwebtoken');
  const user = await db.user.create({ data: { username: 'synthetic-wh-walk', password: 'test-only-unused-hash', name: '合成仓库', role: 'SALES' } });
  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET);

  // Synthetic money-bearing rows (odd figures so a leak is unambiguous).
  const supplier = await db.supplier.create({ data: { name: '合成供应商' } });
  const product = await db.product.create({ data: { customsName: '合成商品', unit: '件' } });
  const port = await db.port.create({ data: { name: '合成港', code: 'SYN' } });
  const customer = await db.customer.create({ data: { name: '合成客户' } });
  const store = await db.store.create({ data: { name: '合成门店', portId: port.id, customerId: customer.id } });
  const purchase = await db.purchaseContract.create({ data: {
    contractNo: 'PC-SYN-1', supplierId: supplier.id, totalAmount: 9876.5, paidAmount: 123.25, invoiceNo: 'INV-SYN-1', status: 'SIGNED',
    items: { create: [{ productId: product.id, quantity: 3, unitPrice: 77.5, totalPrice: 232.5, storeId: store.id }] },
  }, include: { items: true } });
  await db.payment.create({ data: { type: 'PAYABLE', amount: 123.25, paymentDate: new Date(), purchaseContractId: purchase.id } });
  const sale = await db.salesContract.create({ data: {
    contractNo: 'EXP-SYN-1', exchangeRate: 7, totalAmount: 5432.1, receivedAmount: 321.5, customerId: customer.id,
    items: { create: [{ productId: product.id, storeId: store.id, quantity: 3, costPrice: 77.5, sellingPrice: 15.5 }] },
  } });
  await db.payment.create({ data: { type: 'RECEIVABLE_RECEIPT', amount: 321.5, currency: 'USD', paymentDate: new Date(), salesContractId: sale.id } });
  await db.packingItem.create({ data: {
    salesContractId: sale.id, purchaseItemId: purchase.items[0].id, productId: product.id, quantity: 3, boxes: 1,
    unitPrice: 15.5, totalPrice: 46.5, purchaseCost: 232.5, invoiceNo: 'INV-SYN-1',
  } });
  const inventory = await db.inventory.create({ data: { productId: product.id, quantity: 3, status: 'INBOUND', purchaseItemId: purchase.items[0].id } });
  const declaration = await db.customsDeclaration.create({ data: {
    declarationNo: 'HD-SYN-1', salesContractId: sale.id, totalAmount: 46.5,
    items: { create: [{ productId: product.id, customsName: '合成商品', quantity: 3, unitPrice: 15.5, totalPrice: 46.5 }] },
  } });

  const forex = await db.forexVerification.create({ data: { verificationNo: 'FX-SYN-1', salesContractId: sale.id, receivedAmount: 321.5, settledAmount: 2250.5 } });
  const refund = await db.taxRefund.create({ data: { refundNo: 'TR-SYN-1', salesContractId: sale.id, customsDeclarationId: declaration.id, declaredAmount: 46.5, refundableAmount: 26.75 } });

  const app = require('../app');
  const { FORBIDDEN_WAREHOUSE_KEYS, warehouseExemptKeys } = require('../utils/warehouseRedaction');
  server = await new Promise((resolve) => { const l = app.listen(0, '127.0.0.1', () => resolve(l)); });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;

  // Enumerate GET routes from the mounted API router (Express 4 layer regexps: ^\/prefix\/?(?=\/|$)).
  const apiRouter = require('../routes');
  const routes = [];
  for (const layer of apiRouter.stack) {
    if (!layer.handle?.stack) continue;
    const prefix = layer.regexp.source.replace(/^\^/, '').replace(/\\\/\?\(\?=\\\/\|\$\)$/, '').replace(/\\\//g, '/');
    for (const sub of layer.handle.stack) {
      if (sub.route?.methods?.get && typeof sub.route.path === 'string') routes.push(`${prefix}${sub.route.path === '/' ? '' : sub.route.path}`);
    }
  }
  const idFor = {
    purchases: purchase.id, sales: sale.id, suppliers: supplier.id, products: product.id, inventory: inventory.id,
    customers: customer.id, stores: store.id, 'customs-declarations': declaration.id,
    'forex-verifications': forex.id, 'tax-refunds': refund.id,
  };
  const byParam = { productId: product.id, supplierId: supplier.id, storeId: store.id, customerId: customer.id, itemId: purchase.items[0].id };
  const fill = (route) => route.replace(/:(\w+)\??/g, (_m, name) => byParam[name] || idFor[route.split('/')[1]] || 'missing-id');

  const leaks = [];
  const ok = new Set();
  const scan = (node, url, exempt, trail) => {
    if (Array.isArray(node)) { node.forEach((v, i) => scan(v, url, exempt, `${trail}[${i}]`)); return; }
    if (!node || typeof node !== 'object') return;
    // OD-6: an inventory valuation row (totalCost paired with averageCost) keeps totalCost.
    const inventoryCost = 'totalCost' in node && 'averageCost' in node;
    for (const [key, value] of Object.entries(node)) {
      if (FORBIDDEN_WAREHOUSE_KEYS.has(key) && !exempt.has(key) && !(inventoryCost && key === 'totalCost')) leaks.push(`${url} ${trail}.${key}`);
      scan(value, url, exempt, `${trail}.${key}`);
    }
  };
  // The real 100/min global limiter stays mounted; the walk resets its own loopback key between batches.
  const limiter = app._router.stack.find((layer) => typeof layer.handle.resetKey === 'function').handle;
  let calls = 0;
  for (const route of [...new Set(routes)]) {
    const url = fill(route);
    if (++calls % 50 === 0) await limiter.resetKey('127.0.0.1');
    const response = await fetch(`${base}${url}`, { headers: { authorization: `Bearer ${token}` } });
    if (!String(response.headers.get('content-type')).includes('application/json')) { await response.arrayBuffer(); continue; }
    const body = await response.json();
    assert.notEqual(response.status, 429, `rate limited on ${url}`);
    if (response.ok) ok.add(route);
    scan(body, url, warehouseExemptKeys(url), '$');
  }
  assert.deepEqual(leaks, [], `WAREHOUSE responses leak forbidden keys:\n${leaks.join('\n')}`);
  // The walk must actually reach the money-bearing surfaces, or a passing run proves nothing.
  for (const route of ['/purchases', '/purchases/:id', '/sales', '/sales/:id', '/inventory', '/suppliers', '/customs-declarations/:id', '/forex-verifications/:id', '/tax-refunds/:id']) {
    assert.ok(ok.has(route), `expected WAREHOUSE 2xx on ${route}`);
  }
  assert.ok(routes.length > 100, `only ${routes.length} GET routes enumerated`);
});
