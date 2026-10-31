/**
 * Input: customers 路由与 BOSS 只读白名单
 * Output: 写路由的 401/403 角色边界（不触库）、BOSS 只读路径、客户字段/简称校验
 * Pos: 客户 API 路由契约测试；允许角色的真实读写见 integration/customers.integration.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

test('customers writes: anonymous 401, non ADMIN/SALES 403, and no DELETE route exists', async (t) => {
  const auth = require('../middleware/auth');
  t.mock.method(auth, 'authenticate', (req, res, next) => {
    if (req.get('x-synthetic-role')) req.user = { id: 'synthetic-user', role: req.get('x-synthetic-role') };
    next();
  });
  const app = express();
  app.use(express.json());
  app.use('/customers', require('./customers'));
  app.use((err, req, res, next) => res.status(err.statusCode || 500).json({ message: err.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const send = async (method, url, role) => (await fetch(`http://127.0.0.1:${server.address().port}${url}`, {
    method, headers: { 'Content-Type': 'application/json', ...(role ? { 'x-synthetic-role': role } : {}) }, ...(method === 'GET' ? {} : { body: '{}' }),
  })).status;
  for (const [method, url] of [['POST', '/customers'], ['PUT', '/customers/c1']]) {
    assert.equal(await send(method, url), 401, `${method} anonymous`);
    for (const role of ['BOSS', 'PURCHASE', 'WAREHOUSE', 'FINANCE']) assert.equal(await send(method, url, role), 403, `${method} ${role}`);
  }
  assert.equal(await send('DELETE', '/customers/c1', 'ADMIN'), 404);
  assert.equal(await send('PATCH', '/customers/c1', 'ADMIN'), 404);
});

test('BOSS may read customers and their stores but cannot write', () => {
  const { enforceBossReadOnly } = require('../middleware/bossReadOnly');
  const run = (method, url) => () => enforceBossReadOnly({ user: { role: 'BOSS' }, method, originalUrl: `/api/v1${url}` });
  for (const url of ['/customers', '/customers?keyword=a', '/customers/c1', '/customers/c1/stores']) assert.doesNotThrow(run('GET', url), url);
  for (const [method, url] of [['POST', '/customers'], ['PUT', '/customers/c1'], ['DELETE', '/customers/c1'], ['GET', '/customers/c1/other'], ['POST', '/customers/c1/stores']]) {
    assert.throws(run(method, url), /老板角色仅可查看业务/, `${method} ${url}`);
  }
});

test('customer validation: USD only, incoterm list, country, email, store code', async () => {
  const svc = require('../services/customerService');
  assert.doesNotThrow(() => svc.validateCustomerData({ defaultCurrency: 'USD', defaultIncoterm: 'CIF', country: 'US', contactEmail: 'a@b.co' }));
  for (const bad of [{ defaultCurrency: 'EUR' }, { defaultIncoterm: 'DAP' }, { country: 'USA' }, { contactEmail: 'x' }, { note: 'x'.repeat(501) }]) {
    assert.throws(() => svc.validateCustomerData(bad), (e) => e.statusCode === 400, JSON.stringify(bad));
  }
  assert.doesNotThrow(() => svc.validateCustomerData({ contactEmail: null, country: null }));
  assert.equal(svc.normalizeStoreCode(' sac-1 '), 'SAC-1');
  assert.equal(svc.normalizeStoreCode(''), null);
  assert.equal(svc.normalizeStoreCode(undefined), undefined);
  for (const bad of ['a', 'abcdefghijklm', 'a b', 'a_b', 5]) assert.throws(() => svc.normalizeStoreCode(bad), (e) => e.statusCode === 400, String(bad));
});

test('new store customer resolution: explicit active, single active, otherwise 请选择客户', async () => {
  const { resolveCustomerIdForNewStore } = require('../services/customerService');
  const db = (customers) => ({
    customer: {
      findUnique: async ({ where }) => customers.find((c) => c.id === where.id) || null,
      findMany: async ({ where, take }) => customers.filter((c) => c.isActive === where.isActive).slice(0, take),
    },
  });
  const a = { id: 'a', isActive: true };
  const off = { id: 'off', isActive: false };
  assert.equal(await resolveCustomerIdForNewStore(undefined, db([a, off])), 'a');
  assert.equal(await resolveCustomerIdForNewStore('a', db([a, { id: 'b', isActive: true }])), 'a');
  await assert.rejects(resolveCustomerIdForNewStore(undefined, db([])), /请选择客户/);
  await assert.rejects(resolveCustomerIdForNewStore(undefined, db([a, { id: 'b', isActive: true }])), /请选择客户/);
  await assert.rejects(resolveCustomerIdForNewStore('off', db([a, off])), /已归档/);
  await assert.rejects(resolveCustomerIdForNewStore('zzz', db([a])), /客户不存在/);
});
