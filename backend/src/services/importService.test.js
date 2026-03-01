/**
 * Input: importService、prisma
 * Output: 导入服务关键逻辑测试（状态推导、导入记录筛选）
 * Pos: 后端服务层测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../utils/prisma');
const importService = require('./importService');

test('resolveImportStatus: 失败条数为0时返回COMPLETED', () => {
  assert.equal(importService.resolveImportStatus(0), 'COMPLETED');
});

test('resolveImportStatus: 失败条数大于0时返回FAILED', () => {
  assert.equal(importService.resolveImportStatus(1), 'FAILED');
});

test('getImportRecords: 正确组装status/keyword筛选', async () => {
  const originalFindMany = prisma.importRecord.findMany;
  const originalCount = prisma.importRecord.count;

  let findManyArgs = null;
  let countArgs = null;

  prisma.importRecord.findMany = async (args) => {
    findManyArgs = args;
    return [];
  };
  prisma.importRecord.count = async (args) => {
    countArgs = args;
    return 0;
  };

  try {
    const result = await importService.getImportRecords(3, 15, {
      status: 'FAILED',
      keyword: 'demo',
    });

    assert.deepEqual(result, { records: [], total: 0 });
    assert.deepEqual(findManyArgs.where, {
      status: 'FAILED',
      fileName: { contains: 'demo' },
    });
    assert.equal(findManyArgs.skip, 30);
    assert.equal(findManyArgs.take, 15);
    assert.deepEqual(countArgs.where, {
      status: 'FAILED',
      fileName: { contains: 'demo' },
    });
  } finally {
    prisma.importRecord.findMany = originalFindMany;
    prisma.importRecord.count = originalCount;
  }
});
