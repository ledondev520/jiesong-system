/**
 * Input: notificationController、prisma
 * Output: 通知与日志子控制器测试
 * Pos: 后端控制器测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../../utils/prisma');
const notificationController = require('./notificationController');

const createMockRes = () => {
  const res = { statusCode: null, payload: null, headers: {} };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.setHeader = (key, value) => {
    res.headers[key] = value;
    return res;
  };
  res.json = (payload) => {
    res.payload = payload;
    return res;
  };
  res.send = (payload) => {
    res.payload = payload;
    return res;
  };
  return res;
};

test('getNotifications: unreadOnly=true 时按未读筛选并返回 unreadCount', async () => {
  const originalFindMany = prisma.notification.findMany;
  const originalCount = prisma.notification.count;
  let findManyArgs = null;
  const countCalls = [];

  prisma.notification.findMany = async (args) => {
    findManyArgs = args;
    return [{ id: 'n-1', isRead: false }];
  };
  prisma.notification.count = async (args) => {
    countCalls.push(args);
    if (args.where.isRead === false) {
      return 3;
    }
    return 1;
  };

  try {
    const req = {
      user: { id: 'u-1' },
      query: { page: '1', pageSize: '20', unreadOnly: 'true' },
    };
    const res = createMockRes();
    let capturedError = null;

    await notificationController.getNotifications(req, res, (error) => {
      capturedError = error;
    });

    assert.equal(capturedError, null);
    assert.deepEqual(findManyArgs.where, { userId: 'u-1', isRead: false });
    assert.equal(countCalls.length, 2);
    assert.equal(res.payload.data.unreadCount, 3);
    assert.deepEqual(res.payload.data.items, [{ id: 'n-1', isRead: false }]);
  } finally {
    prisma.notification.findMany = originalFindMany;
    prisma.notification.count = originalCount;
  }
});

test('markNotificationRead: 无权限或不存在时返回404', async () => {
  const originalUpdateMany = prisma.notification.updateMany;
  prisma.notification.updateMany = async () => ({ count: 0 });

  try {
    const req = { params: { id: 'n-404' }, user: { id: 'u-1' } };
    const res = createMockRes();
    let capturedError = null;

    await notificationController.markNotificationRead(req, res, (error) => {
      capturedError = error;
    });

    assert.ok(capturedError);
    assert.equal(capturedError.statusCode, 404);
    assert.equal(capturedError.message, '通知不存在或无权限访问');
  } finally {
    prisma.notification.updateMany = originalUpdateMany;
  }
});

test('getLogs: 透传 userId/entity/action 过滤条件', async () => {
  const originalFindMany = prisma.operationLog.findMany;
  const originalCount = prisma.operationLog.count;
  let findManyArgs = null;
  let countArgs = null;

  prisma.operationLog.findMany = async (args) => {
    findManyArgs = args;
    return [];
  };
  prisma.operationLog.count = async (args) => {
    countArgs = args;
    return 0;
  };

  try {
    const req = {
      query: {
        page: '2',
        pageSize: '10',
        userId: 'u-1',
        entity: 'sales',
        action: 'UPDATE',
      },
    };
    const res = createMockRes();
    let capturedError = null;

    await notificationController.getLogs(req, res, (error) => {
      capturedError = error;
    });

    assert.equal(capturedError, null);
    assert.deepEqual(findManyArgs.where, {
      userId: 'u-1',
      entity: 'sales',
      action: 'UPDATE',
    });
    assert.deepEqual(countArgs.where, findManyArgs.where);
    assert.equal(res.payload.code, 200);
    assert.deepEqual(res.payload.data.items, []);
  } finally {
    prisma.operationLog.findMany = originalFindMany;
    prisma.operationLog.count = originalCount;
  }
});

test('getOperationLogs: 支持 keyword 与日期区间过滤', async () => {
  const originalFindMany = prisma.operationLog.findMany;
  const originalCount = prisma.operationLog.count;
  let findManyArgs = null;

  prisma.operationLog.findMany = async (args) => {
    findManyArgs = args;
    return [];
  };
  prisma.operationLog.count = async () => 0;

  try {
    const req = {
      query: {
        keyword: 'admin',
        startDate: '2026-03-01',
        endDate: '2026-03-05',
      },
    };
    const res = createMockRes();
    let capturedError = null;

    await notificationController.getOperationLogs(req, res, (error) => {
      capturedError = error;
    });

    assert.equal(capturedError, null);
    assert.ok(findManyArgs.where.createdAt.gte instanceof Date);
    assert.ok(findManyArgs.where.createdAt.lte instanceof Date);
    assert.ok(Array.isArray(findManyArgs.where.OR));
    assert.ok(findManyArgs.where.OR.length > 0);
  } finally {
    prisma.operationLog.findMany = originalFindMany;
    prisma.operationLog.count = originalCount;
  }
});

test('exportOperationLogsCsv: 返回 CSV 文件', async () => {
  const originalFindMany = prisma.operationLog.findMany;
  prisma.operationLog.findMany = async () => ([
    {
      id: 'log-1',
      createdAt: new Date('2026-03-05T00:00:00.000Z'),
      userId: 'u-1',
      action: 'UPDATE',
      entity: 'Store',
      entityId: 's-1',
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
      oldValue: '{"name":"旧"}',
      newValue: '{"name":"新"}',
      user: {
        id: 'u-1',
        username: 'admin',
        name: '管理员',
      },
    },
  ]);

  try {
    const req = {
      query: {},
    };
    const res = createMockRes();
    let capturedError = null;

    await notificationController.exportOperationLogsCsv(req, res, (error) => {
      capturedError = error;
    });

    assert.equal(capturedError, null);
    assert.equal(res.headers['Content-Type'], 'text/csv; charset=utf-8');
    assert.match(res.headers['Content-Disposition'], /operation_logs_/);
    assert.match(String(res.payload), /"UPDATE"/);
    assert.match(String(res.payload), /"Store"/);
  } finally {
    prisma.operationLog.findMany = originalFindMany;
  }
});
