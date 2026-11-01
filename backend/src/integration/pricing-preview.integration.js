/** Real HTTP/RBAC/SQLite coverage for POST /pricing/preview (订单编辑器报价预览); synthetic data only. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('HTTP/SQLite: pricing preview applies the locked rule (×1.3 / tiles ×1.1, spot−0.2, ceil to whole USD) and guards roles/input', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-pricing-preview-'));
  fs.chmodSync(directory, 0o700);
  const database = path.join(directory, 'synthetic.db');
  process.env.DATABASE_URL = `file:${database}`;
  process.env.UPLOAD_DIR = path.join(directory, 'uploads');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-only-pricing-preview-never-for-production';
  let db, server;
  t.after(async () => {
    if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
    if (db) await db.$disconnect();
    delete process.env.JIESONG_PRICING_CONFIG;
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
  const tokens = {};
  for (const role of ['ADMIN', 'SALES', 'PURCHASE', 'FINANCE', 'WAREHOUSE', 'BOSS']) {
    const user = await db.user.create({ data: { username: `synthetic-preview-${role}`, password: 'test-only-unused-hash', name: `合成${role}`, role } });
    tokens[role] = jwt.sign({ userId: user.id }, process.env.JWT_SECRET);
  }
  const tiles = await db.productCategory.create({ data: { name: '合成瓷砖' } });
  const tileProduct = await db.product.create({ data: { customsName: '合成瓷砖商品', unit: '件', categoryId: tiles.id } });
  const plainProduct = await db.product.create({ data: { customsName: '合成普通商品', unit: '件' } });
  // Private synthetic pricing file (never the repository or an operator file).
  const pricingFile = path.join(directory, 'pricing.json');
  const defaults = require('../../../config/pricing.json');
  fs.writeFileSync(pricingFile, JSON.stringify({
    ...defaults, exchangeRate: 6.72, exchangeAdjustment: -0.2, defaultMarkup: 0.3,
    categoryMarkups: [{ categoryId: tiles.id, categoryName: tiles.name, markup: 0.1 }],
  }), { mode: 0o600 });
  process.env.JIESONG_PRICING_CONFIG = pricingFile;

  const app = require('../app');
  server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const post = async (body, role = 'SALES') => {
    const response = await fetch(`${base}/pricing/preview`, {
      method: 'POST',
      headers: { ...(tokens[role] ? { authorization: `Bearer ${tokens[role]}` } : {}), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: response.status, ...(await response.json()) };
  };

  // Roles: ADMIN/SALES/PURCHASE only; anonymous 401; BOSS cannot POST.
  assert.equal((await post({ lines: [{ costCny: 1 }] }, 'ANONYMOUS')).status, 401);
  for (const role of ['FINANCE', 'WAREHOUSE', 'BOSS']) assert.equal((await post({ lines: [{ costCny: 1 }] }, role)).status, 403, role);

  // Owner example: ¥10,000 × 1.3 = ¥13,000 ÷ (6.72 − 0.2) = 1993.87 → 1994.
  const owner = await post({ lines: [{ costCny: 10000 }] }, 'PURCHASE');
  assert.equal(owner.status, 200);
  assert.equal(owner.data.results[0].status, 'OK');
  assert.equal(owner.data.results[0].unitPriceUsd, 1994);
  assert.equal(owner.data.results[0].effectiveRate, 6.52);
  assert.equal(owner.data.spotRate, 6.72, 'the configured spot rate is returned when none is sent');
  assert.equal((await post({ spotRate: 7.2, lines: [{ costCny: 1 }] })).data.spotRate, 7.2);

  // Category markup is found through the product; a stated spot rate overrides the configured one.
  const mixed = await post({ lines: [{ productId: plainProduct.id, costCny: 1000 }, { productId: tileProduct.id, costCny: 1000 }, { categoryId: tiles.id, costCny: 1000 }] }, 'ADMIN');
  assert.deepEqual(mixed.data.results.map((row) => row.unitPriceUsd), [200, 169, 169]); // 199.39→200, 168.71→169
  assert.deepEqual(mixed.data.results.map((row) => row.markup), [0.3, 0.1, 0.1]);
  const spot = await post({ spotRate: 7.2, lines: [{ costCny: 100 }] });
  assert.equal(spot.data.results[0].unitPriceUsd, 19); // 130 / 7.0 = 18.57 → 19

  // Missing/zero cost has no price; invalid input is rejected without computing.
  const missing = await post({ lines: [{ costCny: 0 }, {}, { costCny: '' }] });
  assert.deepEqual(missing.data.results.map((row) => [row.status, row.unitPriceUsd]), [['MISSING_COST', null], ['MISSING_COST', null], ['MISSING_COST', null]]);
  for (const body of [{}, { lines: [] }, { lines: Array(201).fill({ costCny: 1 }) }, { lines: [{ costCny: 1 }], spotRate: -1 }, { lines: [{ costCny: 1 }], spotRate: '7.2' }, { lines: [7] }]) {
    assert.equal((await post(body)).status, 400, JSON.stringify(body).slice(0, 60));
  }
  // The pricing file is never modified by a preview.
  assert.equal(Object.hasOwn(JSON.parse(fs.readFileSync(pricingFile, 'utf8')), 'roundUpTo'), false);
});
