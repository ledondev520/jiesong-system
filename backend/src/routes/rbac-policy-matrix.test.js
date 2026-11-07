/**
 * Input: 真实挂载的路由模块、真实 authenticate/roleAuth/bossReadOnly 中间件（仅 prisma 用户/Agent 凭证读取被桩替换）
 * Output: Restricted/Confidential 前缀的读/写最大角色集合的实际 HTTP 结果矩阵（ANTI-PLAN P2-5）
 * Pos: 后端路由权限测试；补足 rbac-write-routes.test.js 只检查 "roleAuth(" 子串的缺口
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 * 语义：表中是该路由「最大允许角色集」，角色不在集合内必须 403；集合内的角色可被路由进一步收紧，不在此断言。
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const jwt = require('jsonwebtoken');

const config = require('../config');
const prisma = require('../utils/prisma');
const { errorHandler } = require('../middleware/errorHandler');
const { hashAgentSecret } = require('../utils/agentCredentials');

const ROLES = ['ADMIN', 'FINANCE', 'PURCHASE', 'SALES', 'WAREHOUSE', 'BOSS'];
const ALL = ROLES;
const ADMIN = ['ADMIN'];
const AF = ['ADMIN', 'FINANCE'];
const AFB = ['ADMIN', 'FINANCE', 'BOSS'];

// 前缀 → 路由模块（与 routes/index.js 的挂载一致）
const MODULES = {
  '/bank-flow': './bankFlow',
  '/finance': './finance',
  '/tax-refunds': './taxRefunds',
  '/forex-verifications': './forexVerifications',
  '/suppliers': './suppliers',
  '/users': './users',
  '/agents': './agents',
  '/system': './system',
  '/reports': './reports',
};

// 策略表：自上而下首个匹配生效。read=GET，write=POST/PUT/PATCH/DELETE。
const POLICY = [
  { re: /^\/bank-flow(\/|$)/, read: AFB, write: AF },
  { re: /^\/finance\/statements(\/|$)/, read: AFB, write: AF },
  { re: /^\/finance\/unmatched$/, read: AFB, write: AF },
  { re: /^\/finance\/receivable-reconciliation$/, read: AFB, write: AF },
  { re: /^\/finance\/(match|unmatch|ignore|auto-match)$/, read: AF, write: AF },
  // 账务读不含 WAREHOUSE；写入不含 WAREHOUSE（付款按类型再收紧，销售/采购各自只能写本类）
  { re: /^\/finance(\/|$)/, read: ['ADMIN', 'FINANCE', 'BOSS', 'SALES', 'PURCHASE'], write: ['ADMIN', 'FINANCE', 'SALES', 'PURCHASE'] },
  { re: /^\/tax-refunds\/workbench\/[^/]+\/invoice-verification$/, read: AF, write: AF },
  { re: /^\/tax-refunds\/workbench\/(monthly-export|[^/]+\/preparation(-export)?|[^/]+\/confirm)$/, read: AF, write: AF },
  { re: /^\/tax-refunds\/(auto-drafts)$/, read: AF, write: AF },
  { re: /^\/tax-refunds(\/|$)/, read: ALL, write: ['ADMIN', 'SALES', 'FINANCE'] },
  { re: /^\/forex-verifications(\/|$)/, read: ALL, write: ['ADMIN', 'SALES', 'FINANCE'] },
  { re: /^\/suppliers\/[^/]+\/hard-delete(-preview)?$/, read: ADMIN, write: ADMIN },
  { re: /^\/suppliers(\/|$)/, read: ALL, write: ['ADMIN', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'] },
  { re: /^\/users(\/|$)/, read: ADMIN, write: ADMIN },
  { re: /^\/agents(\/|$)/, read: ADMIN, write: ADMIN },
  { re: /^\/system\/(configs|notifications|seller-identity|exchange-rate|ports|categories|customs-brokers)$/, read: ALL, write: ADMIN },
  { re: /^\/system\/notifications\/[^/]+\/read$/, read: ALL, write: ['ADMIN', 'BOSS', 'PURCHASE', 'SALES', 'FINANCE', 'WAREHOUSE'] },
  { re: /^\/system\/export\//, read: ['ADMIN', 'FINANCE', 'PURCHASE', 'SALES', 'WAREHOUSE'], write: ADMIN },
  { re: /^\/system(\/|$)/, read: ADMIN, write: ADMIN },
  { re: /^\/reports(\/|$)/, read: AFB, write: ADMIN },
];

// bossReadOnly.js 的自身写入例外：BOSS 只能写这些
const BOSS_SELF_WRITES = [/^\/system\/notifications\/[^/]+\/read$/];

const policyFor = (path) => POLICY.find((p) => p.re.test(path));
const fill = (p) => p.replace(/:year/g, '2026').replace(/:month/g, '7').replace(/:[A-Za-z]+/g, 'x1');

const enumerateRoutes = () => {
  const out = [];
  for (const [prefix, mod] of Object.entries(MODULES)) {
    const router = require(mod);
    for (const layer of router.stack.filter((l) => l.route)) {
      for (const method of Object.keys(layer.route.methods)) {
        const sub = fill(layer.route.path === '/' ? '' : layer.route.path);
        out.push({ method: method.toUpperCase(), path: `${prefix}${sub}`, declared: `${prefix}${layer.route.path}` });
      }
    }
  }
  return out;
};

const isWrite = (method) => !['GET', 'HEAD'].includes(method);

const startApp = async (t) => {
  t.mock.method(console, 'error', () => {}); // errorHandler logs every expected 403
  const app = express();
  app.use(express.json());
  app.use('/api/v1', require('./index'));
  app.use(errorHandler);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
};

const humanToken = (role) => jwt.sign({ userId: `u-${role}`, sessionVersion: 0 }, config.jwt.secret, { expiresIn: '5m' });
const AGENT_SECRET = 'synthetic-secret-for-matrix-test';
const AGENT_TOKEN = `jsa_synthetickey.${AGENT_SECRET}`;

// Prisma delegates are not mock.method-able; follow the repo convention of assigning and restoring.
const stub = (t, delegate, name, impl) => {
  const original = delegate[name];
  delegate[name] = impl;
  t.after(() => { delegate[name] = original; });
};

const stubAuth = (t) => {
  stub(t, prisma.user, 'findUnique', async ({ where }) => {
    const role = String(where.id).replace(/^u-/, '');
    return { id: where.id, username: role, name: role, role, isActive: true, sessionVersion: 0 };
  });
  // capabilities: [] —— 有效、启用的 Agent 凭证，但没有任何授权
  stub(t, prisma.agentCredential, 'findUnique', async () => ({
    id: 'cred-1',
    credentialKey: 'synthetickey',
    status: 'ACTIVE',
    revokedAt: null,
    expiresAt: null,
    label: 'matrix',
    secretHash: hashAgentSecret(AGENT_SECRET),
    agentAccount: { id: 'agent-1', name: 'matrix', slug: 'matrix', status: 'ACTIVE', defaultMode: null },
    grants: [],
  }));
  stub(t, prisma.agentCredential, 'update', async () => ({}));
};

const call = async (base, { method, path }, token) => {
  const res = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: isWrite(method) ? '{}' : undefined,
    signal: AbortSignal.timeout(8000),
  });
  await res.arrayBuffer().catch(() => {});
  return res.status;
};

test('策略表覆盖九个前缀下的每一条真实路由', () => {
  const routes = enumerateRoutes();
  assert.ok(routes.length > 100, `route enumeration looks wrong: ${routes.length}`);
  for (const r of routes) assert.ok(policyFor(r.path), `no policy for ${r.method} ${r.declared}`);
});

test('测试线束可信：ADMIN 访问 /users 不是 401/403，缺失/伪造令牌是 401', async (t) => {
  stubAuth(t);
  stub(t, prisma.user, 'findMany', async () => []);
  stub(t, prisma.user, 'count', async () => 0);
  const base = await startApp(t);
  const status = await call(base, { method: 'GET', path: '/users' }, humanToken('ADMIN'));
  assert.ok(![401, 403].includes(status), `ADMIN got ${status}`);
  const bad = await fetch(`${base}/api/v1/users`, { headers: { Authorization: 'Bearer nope' } });
  assert.equal(bad.status, 401);
});

test('人类角色：不在最大允许集合内的角色在每条路由上得到 403', async (t) => {
  stubAuth(t);
  const base = await startApp(t);
  const failures = [];
  for (const route of enumerateRoutes()) {
    const policy = policyFor(route.path);
    const allowed = isWrite(route.method) ? policy.write : policy.read;
    for (const role of ROLES.filter((r) => !allowed.includes(r))) {
      const status = await call(base, route, humanToken(role));
      if (status !== 403) failures.push(`${role} ${route.method} ${route.declared} -> ${status} (expected 403)`);
    }
  }
  assert.deepEqual(failures, [], `\n${failures.join('\n')}`);
});

test('BOSS：除自身写入例外外，所有写路由 403（不论路由角色表是否列出 BOSS）', async (t) => {
  stubAuth(t);
  const base = await startApp(t);
  const failures = [];
  for (const route of enumerateRoutes().filter((r) => isWrite(r.method))) {
    if (BOSS_SELF_WRITES.some((re) => re.test(route.path))) continue;
    const status = await call(base, route, humanToken('BOSS'));
    if (status !== 403) failures.push(`BOSS ${route.method} ${route.declared} -> ${status}`);
  }
  assert.deepEqual(failures, [], `\n${failures.join('\n')}`);
});

test('capabilities 为空的 Agent 令牌在每条路由上得到 403', async (t) => {
  stubAuth(t);
  const base = await startApp(t);
  const failures = [];
  for (const route of enumerateRoutes()) {
    const status = await call(base, route, AGENT_TOKEN);
    if (status !== 403) failures.push(`AGENT ${route.method} ${route.declared} -> ${status}`);
  }
  assert.deepEqual(failures, [], `\n${failures.join('\n')}`);
});

test('WAREHOUSE 不能经通用导出读取付款流水；无银行权限的角色拿不到供应商银行字段', async (t) => {
  stubAuth(t);
  const bank = { bankAccount: 'SYN-ACCT-0001', bankName: 'SYN BANK', bankAccountName: 'SYN', bankBranch: 'SYN', bankCode: 'SYN' };
  const supplier = { id: 'sup-1', name: 'SYN SUPPLIER', shortName: null, aliases: [], ...bank };
  stub(t, prisma.payment, 'findMany', async () => []);
  stub(t, prisma.supplier, 'findMany', async () => [supplier]);
  stub(t, prisma.purchaseContract, 'findUnique', async () => ({ id: 'x1', status: 'DRAFT', totalAmount: 0, paidAmount: 0, supplier, items: [], payments: [], files: [] }));
  stub(t, prisma.purchaseItem, 'findMany', async () => []);
  stub(t, prisma.purchaseReceiptItem, 'groupBy', async () => []);
  const base = await startApp(t);
  const get = async (path, role) => {
    const res = await fetch(`${base}/api/v1${path}`, { headers: { Authorization: `Bearer ${humanToken(role)}` } });
    return { status: res.status, text: await res.text() };
  };
  for (const path of ['/system/export/payments', '/system/export/payments/pdf']) {
    assert.equal((await get(path, 'WAREHOUSE')).status, 403, path);
    assert.notEqual((await get(path, 'SALES')).status, 403, path);
  }
  for (const role of ['SALES', 'WAREHOUSE']) {
    const csv = await get('/system/export/suppliers', role);
    assert.equal(csv.status, 200);
    assert.ok(!csv.text.includes('SYN-ACCT-0001') && !csv.text.includes('银行账户'), `${role} export leaks bank`);
    const detail = await get('/purchases/x1', role);
    assert.equal(detail.status, 200, detail.text);
    assert.ok(!detail.text.includes('SYN-ACCT-0001') && !detail.text.includes('bankName'), `${role} purchase detail leaks bank`);
  }
  assert.ok((await get('/system/export/suppliers', 'PURCHASE')).text.includes('SYN-ACCT-0001'));
});

test('SALES/WAREHOUSE 的 PUT /purchases/:id 响应不含 supplier 银行字段，PURCHASE 保留', async (t) => {
  stubAuth(t);
  const supplier = { id: 'sup-1', name: 'SYN SUPPLIER', bankAccount: 'SYN-ACCT-0001', bankName: 'SYN BANK' };
  const tx = {
    purchaseContract: {
      findUnique: async () => ({ id: 'x1', status: 'DRAFT', taxRate: 13, items: [], _count: { receipts: 0, payments: 0, files: 0 } }),
      update: async () => ({ id: 'x1', supplier, items: [] }),
    },
  };
  stub(t, prisma, '$transaction', async (cb) => cb(tx));
  const base = await startApp(t);
  const put = async (role) => {
    const res = await fetch(`${base}/api/v1/purchases/x1`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${humanToken(role)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: 'syn' }),
    });
    return { status: res.status, text: await res.text() };
  };
  for (const role of ['SALES', 'WAREHOUSE']) {
    const out = await put(role);
    assert.equal(out.status, 200, out.text);
    assert.ok(!out.text.includes('SYN-ACCT-0001') && !out.text.includes('bankName'), `${role} PUT leaks bank`);
  }
  assert.ok((await put('PURCHASE')).text.includes('SYN-ACCT-0001'));
});
