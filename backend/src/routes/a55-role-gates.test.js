/**
 * Input: 真实挂载的 /ai、/import、/three-forms、/contract-doc 路由与真实 authenticate/roleAuth/bossReadOnly（仅 prisma 读取被桩替换）
 * Output: A55 的角色门槛：A1（ADMIN-only 读）、OD-1（PURCHASE 不可建报关草稿）、OD-4（BOSS 仅可下载合同 PDF）
 * Pos: 后端路由权限回归测试；与 rbac-policy-matrix.test.js 互补（那边断言最大角色集合的 403，这里断言放行与特例）
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const jwt = require('jsonwebtoken');

const config = require('../config');
const prisma = require('../utils/prisma');
const { errorHandler } = require('../middleware/errorHandler');

const token = (role) => jwt.sign({ userId: `u-${role}`, sessionVersion: 0 }, config.jwt.secret, { expiresIn: '5m' });

const start = async (t) => {
  t.mock.method(console, 'error', () => {});
  const stub = (delegate, name, impl) => {
    const original = delegate[name];
    delegate[name] = impl;
    t.after(() => { delegate[name] = original; });
  };
  stub(prisma.user, 'findUnique', async ({ where }) => {
    const role = String(where.id).replace(/^u-/, '');
    return { id: where.id, username: role, name: role, role, isActive: true, sessionVersion: 0 };
  });
  stub(prisma.purchaseContract, 'findUnique', async () => null); // GET /contract-doc/pdf → 404，证明已过门槛
  const app = express();
  app.use(express.json());
  app.use('/api/v1', require('./index'));
  app.use(errorHandler);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  return async (method, path, role) => {
    const res = await fetch(base + path, {
      method,
      headers: { Authorization: `Bearer ${token(role)}`, 'Content-Type': 'application/json' },
      body: method === 'GET' ? undefined : '{}',
      signal: AbortSignal.timeout(8000),
    });
    await res.arrayBuffer().catch(() => {});
    return res.status;
  };
};

const NON_ADMIN = ['FINANCE', 'PURCHASE', 'SALES', 'WAREHOUSE', 'BOSS'];

test('A1：/ai/usage/* 与 /import/{history,stats}（routes/dataImport.js） 仅 ADMIN', async (t) => {
  const call = await start(t);
  for (const path of ['/ai/usage/trend', '/ai/usage/calls', '/ai/usage/summary', '/import/history', '/import/stats']) {
    for (const role of NON_ADMIN) assert.equal(await call('GET', path, role), 403, `${role} GET ${path}`);
    const admin = await call('GET', path, 'ADMIN');
    assert.ok(![401, 403].includes(admin), `ADMIN GET ${path} -> ${admin}`);
  }
});

test('OD-1：POST /three-forms/customs-declaration 对 PURCHASE 403，SALES/FINANCE/ADMIN 通过角色门槛', async (t) => {
  const call = await start(t);
  assert.equal(await call('POST', '/three-forms/customs-declaration', 'PURCHASE'), 403);
  assert.equal(await call('POST', '/three-forms/customs-declaration', 'WAREHOUSE'), 403);
  for (const role of ['ADMIN', 'SALES', 'FINANCE']) {
    // 空体 → 400 缺少出口合同 ID，说明已越过 roleAuth
    assert.equal(await call('POST', '/three-forms/customs-declaration', role), 400, role);
  }
});

test('OD-4：BOSS 可下载合同 PDF（GET），仍不能生成（POST）；SALES/WAREHOUSE 两者皆 403', async (t) => {
  const call = await start(t);
  assert.equal(await call('GET', '/contract-doc/pdf/x1', 'BOSS'), 404);
  assert.equal(await call('POST', '/contract-doc/generate/x1', 'BOSS'), 403);
  for (const role of ['SALES', 'WAREHOUSE']) {
    assert.equal(await call('GET', '/contract-doc/pdf/x1', role), 403, role);
    assert.equal(await call('POST', '/contract-doc/generate/x1', role), 403, role);
  }
  for (const role of ['ADMIN', 'PURCHASE', 'FINANCE']) assert.equal(await call('GET', '/contract-doc/pdf/x1', role), 404, role);
});
