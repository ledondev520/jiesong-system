/**
 * Input: node:test、node:assert/strict、授权中间件
 * Output: 认证授权中间件的单元测试结果
 * Pos: 后端授权校验测试文件
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const prisma = require('../utils/prisma');
const { authenticate } = require('./auth');
const { roleAuth, adminOnly } = require('./roleAuth');

/**
 * 职责：创建捕获next错误的函数
 * @returns {Object} 包含next与捕获结果
 */
const createNextCapture = () => {
  const capture = { called: false, error: null };
  const next = (error) => {
    capture.called = true;
    capture.error = error;
  };
  return { next, capture };
};

test('authorize: 未登录时拒绝', () => {
  const req = {};
  const middleware = roleAuth('ADMIN');
  const { next, capture } = createNextCapture();

  middleware(req, {}, next);

  assert.equal(capture.called, true);
  assert.equal(capture.error.statusCode, 401);
  assert.match(capture.error.message, /请先登录/);
});

test('authorize: 角色不匹配时拒绝', () => {
  const req = { user: { role: 'SALES' } };
  const middleware = roleAuth('ADMIN', 'PURCHASE');
  const { next, capture } = createNextCapture();

  middleware(req, {}, next);

  assert.equal(capture.called, true);
  assert.equal(capture.error.statusCode, 403);
  assert.match(capture.error.message, /无权限执行此操作/);
});

test('authorize: 角色匹配时放行', () => {
  const req = { user: { role: 'PURCHASE' } };
  const middleware = roleAuth('ADMIN', 'PURCHASE');
  const { next, capture } = createNextCapture();

  middleware(req, {}, next);

  assert.equal(capture.called, true);
  assert.equal(capture.error, undefined);
});

test('adminOnly: 仅允许管理员', () => {
  const req = { user: { role: 'ADMIN' } };
  const { next, capture } = createNextCapture();

  adminOnly(req, {}, next);

  assert.equal(capture.called, true);
  assert.equal(capture.error, undefined);
});

test('authenticate: Bearer JWT 用户令牌认证成功后附加 user 与 authActor', async () => {
  const originalFindUnique = prisma.user.findUnique;
  const token = jwt.sign(
    { userId: 'user-1', role: 'ADMIN' },
    process.env.JWT_SECRET || 'test-only-jwt-secret-for-ci-123456',
    { expiresIn: '1h' }
  );

  prisma.user.findUnique = async () => ({
    id: 'user-1',
    username: 'admin',
    name: '管理员',
    role: 'ADMIN',
    isActive: true,
    sessionVersion: 0,
  });

  try {
    const req = {
      headers: {
        authorization: `Bearer ${token}`,
      },
    };
    const { next, capture } = createNextCapture();

    await authenticate(req, {}, next);

    assert.equal(capture.called, true);
    assert.equal(capture.error, undefined);
    assert.equal(req.user.id, 'user-1');
    assert.equal(req.authActor.actorType, 'USER');
    assert.equal(req.authActor.userId, 'user-1');
  } finally {
    prisma.user.findUnique = originalFindUnique;
  }
});

test('authenticate: 旧 Agent (jsa_) token 已无认证入口，一律401', async () => {
  for (const [method, baseUrl, path] of [['GET', '/api/v1/search', '/'], ['POST', '/api/v1/purchases', '/'], ['POST', '/mcp', '/']]) {
    const { next, capture } = createNextCapture();
    await authenticate({ method, baseUrl, path, headers: { authorization: 'Bearer jsa_key0.s0' } }, {}, next);
    assert.equal(capture.error?.statusCode, 401, `${method} ${baseUrl}${path}`);
    assert.equal(capture.error?.message, '无效的Token');
  }
});

test('BOSS以数据库角色判定：拒绝业务/AI/MCP写及生成文件GET，允许明确汇总GET', async () => {
  const config = require('../config');
  const { clearAuthCache } = require('./auth');
  const original = prisma.user.findUnique;
  const id = 'boss-synthetic-role-test';
  const token = jwt.sign({ userId: id, role: 'ADMIN' }, config.jwt.secret);
  prisma.user.findUnique = async () => ({ id, role: 'BOSS', isActive: true, sessionVersion: 0 });
  try {
    for (const [method, path, allowed] of [
      ['GET', '/api/v1/reports/business-overview', true], ['GET', '/api/v1/finance/stats', true],
      ['GET', '/api/v1/sales/record/finance-summary', true], ['GET', '/api/v1/sales/record/loading-plan?containerType=40HQ', true], ['GET', '/api/v1/purchases/record/receipts', true],
      ['GET', '/api/v1/purchases/record/receipts/batch/inspections', true],
      ['GET', '/api/v1/containers/record/items', true], ['GET', '/api/v1/containers/record/items/summary', true],
      ['GET', '/api/v1/containers/record/products', true], ['GET', '/api/v1/containers/record/visualization', true],
      ['POST', '/api/v1/finance/payments', false], ['PUT', '/api/v1/purchases/record', false],
      ['POST', '/api/v1/ai/agents/execute-action', false], ['POST', '/mcp', false],
      ['GET', '/api/v1/sales/record/export-excel', false], ['GET', '/api/v1/purchases/export', false],
      ['GET', '/api/v1/contract-doc/pdf/record', true], ['POST', '/api/v1/contract-doc/generate/record', false], ['GET', '/api/v1/system/configs', false],
      ['GET', '/api/v1/users', false], ['GET', '/api/v1/finance/statements/evidence/documents', false],
      ['POST', '/api/v1/auth/change-password', true], ['POST', '/api/v1/notifications/read-all', true],
      ['PUT', '/api/v1/system/notifications/record/read', true], ['POST', '/api/v1/notifications/generate', false],
    ]) {
      const { next, capture } = createNextCapture();
      await authenticate({ headers: { authorization: `Bearer ${token}` }, method, originalUrl: path }, {}, next);
      assert.equal(capture.error?.statusCode ?? 200, allowed ? 200 : 403, `${method} ${path}`);
    }
  } finally { prisma.user.findUnique = original; clearAuthCache(id); }
});
