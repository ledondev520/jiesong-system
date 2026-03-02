/**
 * Input: portCategoryController、prisma
 * Output: 港口/分类子控制器测试
 * Pos: 后端控制器测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../../utils/prisma');
const portCategoryController = require('./portCategoryController');

const createMockRes = () => {
  const res = { statusCode: null, payload: null };
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

test('getPorts: 默认仅查询启用港口并支持 keyword 模糊过滤', async () => {
  const originalFindMany = prisma.port.findMany;
  const originalCount = prisma.port.count;
  let findManyArgs = null;

  prisma.port.findMany = async (args) => {
    findManyArgs = args;
    return [];
  };
  prisma.port.count = async () => 0;

  try {
    const req = { query: { page: '1', pageSize: '20', keyword: ' la ' } };
    const res = createMockRes();
    let capturedError = null;

    await portCategoryController.getPorts(req, res, (error) => {
      capturedError = error;
    });

    assert.equal(capturedError, null);
    assert.equal(findManyArgs.where.isActive, true);
    assert.deepEqual(findManyArgs.where.OR, [
      { name: { contains: 'la', mode: 'insensitive' } },
      { code: { contains: 'la', mode: 'insensitive' } },
    ]);
    assert.deepEqual(res.payload.data.items, []);
  } finally {
    prisma.port.findMany = originalFindMany;
    prisma.port.count = originalCount;
  }
});

test('createPort: 名称或代码重复时返回400', async () => {
  const originalFindFirst = prisma.port.findFirst;
  prisma.port.findFirst = async () => ({ id: 'port-1', name: '洛杉矶', code: 'LA' });

  try {
    const req = { body: { name: '洛杉矶', code: 'LA' } };
    const res = createMockRes();
    let capturedError = null;

    await portCategoryController.createPort(req, res, (error) => {
      capturedError = error;
    });

    assert.ok(capturedError);
    assert.equal(capturedError.statusCode, 400);
    assert.equal(capturedError.message, '港口名称或代码已存在');
  } finally {
    prisma.port.findFirst = originalFindFirst;
  }
});

test('updatePort: 目标港口不存在时返回404', async () => {
  const originalFindUnique = prisma.port.findUnique;
  prisma.port.findUnique = async () => null;

  try {
    const req = { params: { id: 'missing' }, body: { name: '新港口' } };
    const res = createMockRes();
    let capturedError = null;

    await portCategoryController.updatePort(req, res, (error) => {
      capturedError = error;
    });

    assert.ok(capturedError);
    assert.equal(capturedError.statusCode, 404);
    assert.equal(capturedError.message, '港口不存在');
  } finally {
    prisma.port.findUnique = originalFindUnique;
  }
});

test('createCategory: 父分类不存在时返回400', async () => {
  const originalFindUnique = prisma.productCategory.findUnique;
  prisma.productCategory.findUnique = async () => null;

  try {
    const req = { body: { name: '瓷砖', parentId: 'missing-parent' } };
    const res = createMockRes();
    let capturedError = null;

    await portCategoryController.createCategory(req, res, (error) => {
      capturedError = error;
    });

    assert.ok(capturedError);
    assert.equal(capturedError.statusCode, 400);
    assert.equal(capturedError.message, '父级分类不存在');
  } finally {
    prisma.productCategory.findUnique = originalFindUnique;
  }
});

test('updateCategory: 父级分类不能等于自己', async () => {
  const originalFindUnique = prisma.productCategory.findUnique;
  prisma.productCategory.findUnique = async () => ({ id: 'cat-1' });

  try {
    const req = { params: { id: 'cat-1' }, body: { parentId: 'cat-1' } };
    const res = createMockRes();
    let capturedError = null;

    await portCategoryController.updateCategory(req, res, (error) => {
      capturedError = error;
    });

    assert.ok(capturedError);
    assert.equal(capturedError.statusCode, 400);
    assert.equal(capturedError.message, '父级分类不能选择自己');
  } finally {
    prisma.productCategory.findUnique = originalFindUnique;
  }
});

test('removeCategory: 分类下存在商品时拒绝删除', async () => {
  const originalFindUnique = prisma.productCategory.findUnique;
  const originalCategoryCount = prisma.productCategory.count;
  const originalProductCount = prisma.product.count;

  prisma.productCategory.findUnique = async () => ({ id: 'cat-1' });
  prisma.productCategory.count = async () => 0;
  prisma.product.count = async () => 2;

  try {
    const req = { params: { id: 'cat-1' } };
    const res = createMockRes();
    let capturedError = null;

    await portCategoryController.removeCategory(req, res, (error) => {
      capturedError = error;
    });

    assert.ok(capturedError);
    assert.equal(capturedError.statusCode, 400);
    assert.equal(capturedError.message, '该分类下仍有关联商品，无法删除');
  } finally {
    prisma.productCategory.findUnique = originalFindUnique;
    prisma.productCategory.count = originalCategoryCount;
    prisma.product.count = originalProductCount;
  }
});
