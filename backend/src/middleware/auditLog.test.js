/**
 * Input: auditLog middleware
 * Output: 审计日志中间件单元测试
 * Pos: 审计能力回归测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const prisma = require('../utils/prisma');
const auditLogUtils = require('../utils/auditLog');
const { withAuditLog } = require('./auditLog');

const waitForAsyncTasks = () => new Promise((resolve) => setTimeout(resolve, 0));

const createMockRes = () => {
  const res = new EventEmitter();
  res.statusCode = 200;
  res.payload = null;
  res.writableEnded = true;
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.payload = payload;
    res.emit('finish');
    return res;
  };
  res.send = (payload) => {
    res.payload = payload;
    res.emit('finish');
    return res;
  };
  return res;
};

test('withAuditLog: UPDATE 时记录 before/after 快照', async () => {
  const originalFindUnique = prisma.store.findUnique;
  const originalLogOperation = auditLogUtils.logOperation;
  let findUniqueCalls = 0;
  let captured = null;

  prisma.store.findUnique = async () => {
    findUniqueCalls += 1;
    if (findUniqueCalls === 1) {
      return { id: 'store-1', name: '旧门店' };
    }
    return { id: 'store-1', name: '新门店' };
  };
  auditLogUtils.logOperation = async (payload) => {
    captured = payload;
  };

  try {
    const handler = async (req, res) => {
      res.status(200).json({
        code: 200,
        data: { id: 'store-1', name: '新门店' },
      });
    };
    const middleware = withAuditLog(
      { entity: 'Store', action: 'UPDATE', model: 'store' },
      handler
    );
    const req = {
      method: 'PUT',
      params: { id: 'store-1' },
      user: { id: 'user-1' },
      body: { name: '新门店' },
      headers: {},
    };
    const res = createMockRes();

    await middleware(req, res, () => {});
    await waitForAsyncTasks();

    assert.ok(captured, '应调用 logOperation');
    assert.equal(captured.userId, 'user-1');
    assert.equal(captured.action, 'UPDATE');
    assert.equal(captured.entity, 'Store');
    assert.equal(captured.entityId, 'store-1');
    assert.deepEqual(captured.oldValue, { id: 'store-1', name: '旧门店' });
    assert.deepEqual(captured.newValue, { id: 'store-1', name: '新门店' });
  } finally {
    prisma.store.findUnique = originalFindUnique;
    auditLogUtils.logOperation = originalLogOperation;
  }
});

test('withAuditLog: 非2xx响应不记录日志', async () => {
  const originalLogOperation = auditLogUtils.logOperation;
  let called = false;
  auditLogUtils.logOperation = async () => {
    called = true;
  };

  try {
    const handler = async (req, res) => {
      res.status(400).json({ code: 400, message: 'bad request' });
    };
    const middleware = withAuditLog(
      { entity: 'Store', action: 'UPDATE', model: 'store', captureBefore: false },
      handler
    );
    const req = {
      method: 'PUT',
      params: { id: 'store-1' },
      user: { id: 'user-1' },
      body: { name: 'x' },
      headers: {},
    };
    const res = createMockRes();

    await middleware(req, res, () => {});
    await waitForAsyncTasks();

    assert.equal(called, false);
  } finally {
    auditLogUtils.logOperation = originalLogOperation;
  }
});

test('withAuditLog: 支持从响应中解析 userId/entityId（登录场景）', async () => {
  const originalLogOperation = auditLogUtils.logOperation;
  let captured = null;
  auditLogUtils.logOperation = async (payload) => {
    captured = payload;
  };

  try {
    const handler = async (req, res) => {
      res.status(200).json({
        code: 200,
        data: {
          token: 'jwt-token',
          user: {
            id: 'user-login-1',
            username: 'admin',
          },
        },
      });
    };
    const middleware = withAuditLog(
      {
        entity: 'User',
        action: 'LOGIN',
        getUserId: ({ responseData }) => responseData?.user?.id,
        getEntityId: ({ responseData }) => responseData?.user?.id,
      },
      handler
    );
    const req = {
      method: 'POST',
      params: {},
      body: { username: 'admin', password: 'secret' },
      headers: {},
    };
    const res = createMockRes();

    await middleware(req, res, () => {});
    await waitForAsyncTasks();

    assert.ok(captured, '应调用 logOperation');
    assert.equal(captured.userId, 'user-login-1');
    assert.equal(captured.entityId, 'user-login-1');
    assert.equal(captured.action, 'LOGIN');
  } finally {
    auditLogUtils.logOperation = originalLogOperation;
  }
});
