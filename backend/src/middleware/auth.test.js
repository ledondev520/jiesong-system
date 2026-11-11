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

test('OD-8：已停用角色（PURCHASE/FINANCE/WAREHOUSE/BOSS）按数据库角色在每个入口 403，ADMIN/SALES 通过', async () => {
  const config = require('../config');
  const { clearAuthCache } = require('./auth');
  const original = prisma.user.findUnique;
  const id = 'retired-synthetic-role-test';
  const token = jwt.sign({ userId: id, role: 'ADMIN' }, config.jwt.secret);
  let role;
  prisma.user.findUnique = async () => ({ id, role, isActive: true, sessionVersion: 0 });
  try {
    for (role of ['PURCHASE', 'FINANCE', 'WAREHOUSE', 'BOSS', 'ADMIN', 'SALES']) {
      for (const [method, path] of [['GET', '/api/v1/purchases'], ['GET', '/api/v1/reports/business-overview'], ['POST', '/api/v1/auth/change-password']]) {
        const { next, capture } = createNextCapture();
        await authenticate({ headers: { authorization: `Bearer ${token}` }, method, originalUrl: path }, {}, next);
        const retired = !['ADMIN', 'SALES'].includes(role);
        assert.equal(capture.error?.statusCode ?? 200, retired ? 403 : 200, `${role} ${method} ${path}`);
      }
      const { next, capture } = createNextCapture();
      await authenticate({ headers: { authorization: `Bearer ${token}` }, method: 'POST', originalUrl: '/api/v1/auth/logout' }, {}, next);
      assert.equal(capture.error?.statusCode ?? 200, 200, `${role} can still log out`);
      clearAuthCache(id);
    }
  } finally { prisma.user.findUnique = original; clearAuthCache(id); }
});
