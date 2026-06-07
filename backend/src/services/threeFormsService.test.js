/**
 * Input: threeFormsService、Prisma mock delegates
 * Output: 三表导出服务单元测试
 * Pos: 后端服务层测试，覆盖三表导出错误路径 Interface
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../utils/prisma');
const { exportThreeFormsExcel } = require('./threeFormsService');

test('exportThreeFormsExcel: 合同不存在时返回受控 404 且不查询旧 currency 字段', async () => {
  const originalSalesContract = prisma.salesContract;
  let findUniqueArgs = null;

  prisma.salesContract = {
    findUnique: async (args) => {
      findUniqueArgs = args;
      return null;
    },
  };

  try {
    await assert.rejects(
      () => exportThreeFormsExcel('missing-sales'),
      (error) => error.statusCode === 404 && error.message === '合同不存在',
    );
    assert.deepEqual(findUniqueArgs.select, {
      contractNo: true,
      totalAmount: true,
    });
  } finally {
    prisma.salesContract = originalSalesContract;
  }
});
