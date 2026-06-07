/**
 * Input: fileService、Prisma mock delegates
 * Output: 合同附件服务单元测试
 * Pos: 后端服务层测试，覆盖统一附件列表 Interface
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../utils/prisma');
const fileService = require('./fileService');

const withMockDelegates = async (mockDelegates, callback) => {
  const originals = {};
  for (const key of Object.keys(mockDelegates)) {
    originals[key] = prisma[key];
    prisma[key] = mockDelegates[key];
  }

  try {
    await callback();
  } finally {
    for (const key of Object.keys(mockDelegates)) {
      if (typeof originals[key] === 'undefined') {
        delete prisma[key];
      } else {
        prisma[key] = originals[key];
      }
    }
  }
};

test('listFiles: 默认读取采购合同附件并补充合同类型', async () => {
  let findManyArgs = null;

  await withMockDelegates({
    contractFile: {
      findMany: async (args) => {
        findManyArgs = args;
        return [{ id: 'file-1', purchaseContractId: 'purchase-1', fileName: '合同.pdf' }];
      },
    },
  }, async () => {
    const result = await fileService.listFiles('purchase-1', 'PURCHASE');

    assert.deepEqual(findManyArgs, {
      where: { purchaseContractId: 'purchase-1' },
      orderBy: { uploadedAt: 'desc' },
    });
    assert.equal(result[0].contractType, 'PURCHASE');
  });
});

test('listFiles: 销售合同附件走 salesContractFile delegate', async () => {
  let findManyArgs = null;

  await withMockDelegates({
    salesContractFile: {
      findMany: async (args) => {
        findManyArgs = args;
        return [{ id: 'file-2', salesContractId: 'sales-1', fileName: '销售合同.pdf' }];
      },
    },
  }, async () => {
    const result = await fileService.listFiles('sales-1', 'SALES');

    assert.deepEqual(findManyArgs, {
      where: { salesContractId: 'sales-1' },
      orderBy: { uploadedAt: 'desc' },
    });
    assert.equal(result[0].contractType, 'SALES');
  });
});
