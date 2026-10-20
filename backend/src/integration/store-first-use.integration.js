/** Real HTTP/RBAC/SQLite coverage for a SALES user's first store; synthetic data only. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('HTTP/SQLite: SALES creates the first store and uses it on a contract without widening RBAC', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-store-first-use-'));
  fs.chmodSync(directory, 0o700);
  const database = path.join(directory, 'synthetic.db');
  process.env.DATABASE_URL = `file:${database}`;
  process.env.UPLOAD_DIR = path.join(directory, 'uploads');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-only-store-first-use-never-for-production';
  let db, server;
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (db) await db.$disconnect();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const ddl = execFileSync(process.execPath, [
    require.resolve('prisma/build/index.js'), 'migrate', 'diff', '--from-empty',
    '--to-schema-datamodel', path.resolve(__dirname, '../../prisma/schema.prisma'), '--script',
  ], { encoding: 'utf8', timeout: 30000 });
  execFileSync('python3', ['-c', 'import sqlite3,sys,os; os.umask(0o077); c=sqlite3.connect(sys.argv[1]); c.executescript(sys.stdin.read()); c.close()', database], { input: ddl });
  fs.chmodSync(database, 0o600);
  db = require('../utils/prisma');
  const jwt = require('jsonwebtoken');
  const config = require('../config');
  const tokens = {};
  for (const role of ['ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE', 'BOSS']) {
    const user = await db.user.create({ data: { username: `synthetic-store-${role}`, password: 'test-only-unused-hash', name: `合成${role}`, role } });
    tokens[role] = jwt.sign({ userId: user.id }, config.jwt.secret);
  }
  const port = await db.port.create({ data: { name: '合成有效港口', code: 'QA-STORE' } });
  await db.port.create({ data: { name: '合成停用港口', code: 'QA-OFF', isActive: false } });
  const app = require('../app');
  server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const call = async (method, url, body, role = 'SALES', expected = 200) => {
    const response = await fetch(base + url, {
      method,
      headers: { ...(tokens[role] ? { authorization: `Bearer ${tokens[role]}` } : {}), 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json();
    assert.equal(response.status, expected, `${role} ${method} ${url}: ${result.message || ''}`);
    return result.data;
  };
  assert.deepEqual((await call('GET', '/stores?lite=true')).items, []);
  const ports = await call('GET', '/stores/options/ports');
  assert.deepEqual(ports.map((entry) => entry.id), [port.id]);
  await call('POST', '/stores', { portId: port.id }, 'SALES', 400);
  await call('POST', '/stores', { name: '合成缺少港口门店' }, 'SALES', 400);
  await call('POST', '/stores', { name: '合成未授权门店', portId: port.id }, 'BOSS', 403);
  await call('POST', '/stores', { name: '合成匿名门店', portId: port.id }, 'ANONYMOUS', 401);
  assert.equal(await db.store.count(), 0, 'invalid and forbidden writes must not create a store');
  const input = { name: '合成首个门店', portId: port.id, contactName: '合成联系人', contactPhone: 'synthetic-phone', contactEmail: 'store@example.invalid', address: '合成地址' };
  const store = await call('POST', '/stores', input, 'SALES', 201);
  assert.ok(store.id);
  assert.equal(store.port.id, port.id);
  for (const [key, value] of Object.entries(input)) assert.equal(store[key], value);
  const catalog = await call('GET', '/stores?lite=true');
  assert.equal(catalog.items.length, 1);
  assert.equal(catalog.items[0].id, store.id);
  const product = await db.product.create({ data: { customsName: '合成销售商品', unit: '件' } });
  const sale = await call('POST', '/sales', { exchangeRate: 7.2, items: [{ storeId: store.id, productId: product.id, quantity: 2, costPrice: 10, sellingPrice: 2, unit: '件' }] }, 'SALES', 201);
  assert.equal(sale.items.length, 1, 'the first store is accepted by atomic contract creation');
  assert.equal((await db.salesItem.findFirst({ where: { salesContractId: sale.id } })).storeId, store.id);
  for (const role of ['ADMIN', 'PURCHASE', 'FINANCE', 'WAREHOUSE']) {
    await call('POST', '/stores', { name: `合成${role}门店`, portId: port.id }, role, 201);
  }
  assert.equal(await db.store.count(), 5, 'only the existing five write roles remain authorized');
});
