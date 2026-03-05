/**
 * Input: inventorySnapshot service
 * Output: 库存快照财务对齐关键路径测试
 * Pos: 后端服务层测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../utils/prisma');
const { reconcileSalesFinancials } = require('./inventorySnapshot');

test('reconcileSalesFinancials: 按 quantity * 单价 对齐合同金额与成本', async () => {
  const originalFindMany = prisma.salesItem.findMany;
  const originalUpdate = prisma.salesContract.update;
  let updateArgs = null;

  prisma.salesItem.findMany = async () => [
    { quantity: 2, sellingPrice: 100, costPrice: 40 },
    { quantity: 3, sellingPrice: 50, costPrice: 30 },
  ];
  prisma.salesContract.update = async (args) => {
    updateArgs = args;
    return { id: 'sc-1', totalAmount: args.data.totalAmount };
  };

  try {
    const result = await reconcileSalesFinancials(prisma, 'sc-1');

    assert.deepEqual(updateArgs, {
      where: { id: 'sc-1' },
      data: { totalAmount: 350 },
    });
    assert.deepEqual(result, {
      totalAmount: 350,
      totalCost: 170,
      grossProfit: 180,
    });
  } finally {
    prisma.salesItem.findMany = originalFindMany;
    prisma.salesContract.update = originalUpdate;
  }
});
