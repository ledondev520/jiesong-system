/**
 * Input: inventorySnapshot service
 * Output: 库存快照财务对齐关键路径测试
 * Pos: 后端服务层测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../utils/prisma');
const {
  reconcileSalesFinancials,
  revertPurchaseInStock,
  revertSalesOutStock,
} = require('./inventorySnapshot');

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

test('revertPurchaseInStock: 回滚采购入库操作', async () => {
  const mockTx = {
    purchaseContract: {
      findUnique: async () => ({
        id: 'pc-1',
        items: [{ id: 'item-1' }, { id: 'item-2' }],
      }),
      update: async () => ({}),
    },
    inventory: {
      deleteMany: async () => ({ count: 2 }),
    },
    purchaseItem: {
      aggregate: async () => ({ _sum: { totalPrice: 1000 } }),
    },
  };

  const result = await revertPurchaseInStock(mockTx, 'pc-1');
  assert.equal(result.reverted, 2);
});

test('revertSalesOutStock: 回滚销售出库操作', async () => {
  const mockTx = {
    salesContract: {
      findUnique: async () => ({
        id: 'sc-1',
        items: [{ id: 'item-1' }, { id: 'item-2' }],
      }),
      update: async () => ({}),
    },
    inventory: {
      findMany: async () => [
        { id: 'inv-1', salesItemId: 'item-1', status: 'OUTBOUND' },
        { id: 'inv-2', salesItemId: 'item-2', status: 'OUTBOUND' },
      ],
      update: async () => ({}),
    },
    salesItem: {
      findMany: async () => [],
    },
  };

  const result = await revertSalesOutStock(mockTx, 'sc-1');
  assert.equal(result.reverted, 2);
});
