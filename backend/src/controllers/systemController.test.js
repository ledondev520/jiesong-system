/**
 * Input: systemController、prisma
 * Output: 系统控制器关键行为测试（通知权限、港口与分类）
 * Pos: 后端控制器测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../utils/prisma');
const systemController = require('./systemController');

const createMockRes = () => {
  const res = {
    statusCode: null,
    payload: null,
  };

  res.status = (code) => {
    res.statusCode = code;
    return res;
  };

  res.json = (payload) => {
    res.payload = payload;
    return res;
  };

  return res;
};

test('markNotificationRead: 仅允许标记当前用户通知', async () => {
  const original = prisma.notification.updateMany;
  let capturedArgs = null;

  prisma.notification.updateMany = async (args) => {
    capturedArgs = args;
    return { count: 1 };
  };

  try {
    const req = { params: { id: 'notice-1' }, user: { id: 'user-1' } };
    const res = createMockRes();
    let capturedError = null;
    const next = (error) => {
      capturedError = error;
    };

    await systemController.markNotificationRead(req, res, next);

    assert.equal(capturedError, null);
    assert.deepEqual(capturedArgs.where, { id: 'notice-1', userId: 'user-1' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.message, '已标记为已读');
  } finally {
    prisma.notification.updateMany = original;
  }
});

test('markNotificationRead: 通知不存在或非本人时返回404', async () => {
  const original = prisma.notification.updateMany;

  prisma.notification.updateMany = async () => ({ count: 0 });

  try {
    const req = { params: { id: 'notice-2' }, user: { id: 'user-1' } };
    const res = createMockRes();
    let capturedError = null;
    const next = (error) => {
      capturedError = error;
    };

    await systemController.markNotificationRead(req, res, next);

    assert.ok(capturedError);
    assert.equal(capturedError.statusCode, 404);
    assert.equal(capturedError.message, '通知不存在或无权限访问');
  } finally {
    prisma.notification.updateMany = original;
  }
});

test('getPorts: 默认只查询启用港口并返回分页结构', async () => {
  const originalFindMany = prisma.port.findMany;
  const originalCount = prisma.port.count;
  let capturedFindManyArgs = null;

  prisma.port.findMany = async (args) => {
    capturedFindManyArgs = args;
    return [];
  };
  prisma.port.count = async () => 0;

  try {
    const req = { query: { page: '1', pageSize: '20' } };
    const res = createMockRes();
    let capturedError = null;
    const next = (error) => {
      capturedError = error;
    };

    await systemController.getPorts(req, res, next);

    assert.equal(capturedError, null);
    assert.deepEqual(capturedFindManyArgs.where, { isActive: true });
    assert.equal(res.payload.code, 200);
    assert.deepEqual(res.payload.data.items, []);
  } finally {
    prisma.port.findMany = originalFindMany;
    prisma.port.count = originalCount;
  }
});

test('createCategory: 父级分类不存在时返回400', async () => {
  const originalFindUnique = prisma.productCategory.findUnique;
  prisma.productCategory.findUnique = async () => null;

  try {
    const req = { body: { name: '瓷砖', parentId: 'missing-parent' } };
    const res = createMockRes();
    let capturedError = null;
    const next = (error) => {
      capturedError = error;
    };

    await systemController.createCategory(req, res, next);

    assert.ok(capturedError);
    assert.equal(capturedError.statusCode, 400);
    assert.equal(capturedError.message, '父级分类不存在');
  } finally {
    prisma.productCategory.findUnique = originalFindUnique;
  }
});

test('removeCategory: 存在子分类时拒绝删除', async () => {
  const originalFindUnique = prisma.productCategory.findUnique;
  const originalCategoryCount = prisma.productCategory.count;
  const originalProductCount = prisma.product.count;

  prisma.productCategory.findUnique = async () => ({ id: 'cat-1' });
  prisma.productCategory.count = async () => 1;
  prisma.product.count = async () => 0;

  try {
    const req = { params: { id: 'cat-1' } };
    const res = createMockRes();
    let capturedError = null;
    const next = (error) => {
      capturedError = error;
    };

    await systemController.removeCategory(req, res, next);

    assert.ok(capturedError);
    assert.equal(capturedError.statusCode, 400);
    assert.equal(capturedError.message, '请先删除子分类后再删除当前分类');
  } finally {
    prisma.productCategory.findUnique = originalFindUnique;
    prisma.productCategory.count = originalCategoryCount;
    prisma.product.count = originalProductCount;
  }
});
