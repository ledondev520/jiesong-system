/**
 * Input: node:test、node:assert/strict、授权中间件
 * Output: 认证授权中间件的单元测试结果
 * Pos: 后端授权校验测试文件
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const prisma = require('../utils/prisma');
const { hashAgentSecret } = require('../utils/agentCredentials');
const { authenticate } = require('./auth');
const { roleAuth, adminOnly, capabilityAuth, accessAuth } = require('./roleAuth');

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

test('capabilityAuth: Agent grant 匹配时放行', () => {
  const req = {
    authActor: { actorType: 'AGENT' },
    agent: {
      grants: [
        { resource: 'search', action: 'read' },
      ],
    },
  };
  const middleware = capabilityAuth('search.read');
  const { next, capture } = createNextCapture();

  middleware(req, {}, next);

  assert.equal(capture.called, true);
  assert.equal(capture.error, undefined);
});

test('capabilityAuth: Agent grant 缺失时拒绝', () => {
  const req = {
    authActor: { actorType: 'AGENT' },
    agent: {
      grants: [
        { resource: 'purchase', action: 'create' },
      ],
    },
  };
  const middleware = capabilityAuth('search.read');
  const { next, capture } = createNextCapture();

  middleware(req, {}, next);

  assert.equal(capture.called, true);
  assert.equal(capture.error.statusCode, 403);
});

test('accessAuth: 用户按角色授权通过', () => {
  const req = {
    authActor: { actorType: 'USER' },
    user: { id: 'user-1', role: 'PURCHASE' },
  };
  const middleware = accessAuth({ roles: ['ADMIN', 'PURCHASE'], capabilities: ['purchase.create'] });
  const { next, capture } = createNextCapture();

  middleware(req, {}, next);

  assert.equal(capture.called, true);
  assert.equal(capture.error, undefined);
});

test('accessAuth: Agent 按 capability 授权通过', () => {
  const req = {
    authActor: { actorType: 'AGENT' },
    agent: { grants: [{ resource: 'purchase', action: 'create' }] },
  };
  const middleware = accessAuth({ roles: ['ADMIN'], capabilities: ['purchase.create'] });
  const { next, capture } = createNextCapture();

  middleware(req, {}, next);

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

test('authenticate: Agent token 认证成功后附加 agent 与 authActor', async () => {
  const originalAgentCredential = prisma.agentCredential;
  const rawToken = 'jsa_key123.secret456';

  prisma.agentCredential = {
    findUnique: async ({ where }) => {
      assert.deepEqual(where, { credentialKey: 'key123' });
      return {
        id: 'cred-1',
        credentialKey: 'key123',
        secretHash: hashAgentSecret('secret456'),
        status: 'ACTIVE',
        expiresAt: null,
        revokedAt: null,
        agentAccount: {
          id: 'agent-1',
          name: '采购机器人',
          slug: 'purchase-bot',
          status: 'ACTIVE',
        },
        grants: [
          { resource: 'search', action: 'read' },
          { resource: 'purchase', action: 'create' },
        ],
      };
    },
  };

  try {
    const req = {
      headers: {
        authorization: `Bearer ${rawToken}`,
      },
    };
    const { next, capture } = createNextCapture();

    await authenticate(req, {}, next);

    assert.equal(capture.called, true);
    assert.equal(capture.error, undefined);
    assert.equal(req.user, undefined);
    assert.equal(req.agent.id, 'agent-1');
    assert.equal(req.agentCredential.id, 'cred-1');
    assert.equal(req.authActor.actorType, 'AGENT');
    assert.equal(req.authActor.agentAccountId, 'agent-1');
    assert.equal(req.authActor.agentCredentialId, 'cred-1');
    assert.deepEqual(req.agent.grants, [
      { resource: 'search', action: 'read', scopeJson: null },
      { resource: 'purchase', action: 'create', scopeJson: null },
    ]);
  } finally {
    prisma.agentCredential = originalAgentCredential;
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
      ['GET', '/api/v1/sales/record/finance-summary', true], ['GET', '/api/v1/purchases/record/receipts', true],
      ['GET', '/api/v1/purchases/record/receipts/batch/inspections', true],
      ['GET', '/api/v1/containers/record/items', true], ['GET', '/api/v1/containers/record/items/summary', true],
      ['GET', '/api/v1/containers/record/products', true], ['GET', '/api/v1/containers/record/visualization', true],
      ['POST', '/api/v1/finance/payments', false], ['PUT', '/api/v1/purchases/record', false],
      ['POST', '/api/v1/ai/agents/execute-action', false], ['POST', '/mcp', false],
      ['GET', '/api/v1/sales/record/export-excel', false], ['GET', '/api/v1/purchases/export', false],
      ['GET', '/api/v1/contract-doc/pdf/record', false], ['GET', '/api/v1/system/configs', false],
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
