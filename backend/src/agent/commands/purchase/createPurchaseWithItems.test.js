const test = require('node:test');
const assert = require('node:assert/strict');
const { createPurchaseWithItems } = require('./createPurchaseWithItems');

test('createPurchaseWithItems: 事务内创建合同和明细并返回完整结果', async () => {
  const calls = [];

  const tx = {
    purchaseContract: {
      count: async () => 12,
      create: async ({ data }) => {
        calls.push(['contract.create', data]);
        return { id: 'purchase-1', contractNo: data.contractNo };
      },
      findUnique: async () => ({
        id: 'purchase-1',
        contractNo: 'CG2600013',
        supplier: { id: 'supplier-1', name: '佛山A厂' },
        items: [
          {
            id: 'item-1',
            product: { id: 'product-1', customsName: '瓷砖' },
            quantity: 10,
            unitPrice: 45,
            totalPrice: 450,
          },
        ],
      }),
    },
    purchaseItem: {
      createMany: async ({ data }) => {
        calls.push(['items.createMany', data]);
        return { count: data.length };
      },
    },
  };

  const prismaClient = {
    $transaction: async (handler) => handler(tx),
  };

  const result = await createPurchaseWithItems({
    input: {
      supplierId: 'supplier-1',
      taxRate: 13,
      note: '首批录入',
      items: [
        { productId: 'product-1', quantity: 10, unitPrice: 45, unit: '片' },
      ],
    },
    prismaClient,
  });

  assert.equal(result.contractNo, 'CG2600013');
  assert.equal(calls[0][0], 'contract.create');
  assert.equal(calls[0][1].totalAmount, 508.5);
  assert.equal(calls[1][0], 'items.createMany');
  assert.equal(calls[1][1][0].totalPrice, 508.5);
});

test('createPurchaseWithItems: 缺少 items 时拒绝', async () => {
  await assert.rejects(
    () => createPurchaseWithItems({
      input: {
        supplierId: 'supplier-1',
        items: [],
      },
      prismaClient: {},
    }),
    /至少提供一条采购明细/
  );
});
