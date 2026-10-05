const test = require('node:test');
const assert = require('node:assert/strict');
const { createPurchaseWithItems } = require('./createPurchaseWithItems');

test('createPurchaseWithItems: 事务内创建合同和明细并返回完整结果', async () => {
  const calls = [];

  const tx = {
    purchaseContract: {
      findMany: async () => [{ contractNo: `CG${new Date().getFullYear().toString().slice(-2)}00012` }],
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

test('自动编号竞争整笔重新分配，显式编号和无关异常不自动重试', async () => {
  const input = { supplierId: 'synthetic-supplier', items: [{ productId: 'synthetic-product', quantity: 1, unitPrice: 1 }] };
  const duplicateNumber = Object.assign(new Error('synthetic collision'), { code: 'P2002', meta: { target: ['contractNo'] } });
  let attempts = 0;
  const db = { $transaction: async () => { if (++attempts === 1) throw duplicateNumber; return { id: 'synthetic-created' }; } };
  assert.equal((await createPurchaseWithItems({ input, prismaClient: db })).id, 'synthetic-created');
  assert.equal(attempts, 2);

  attempts = 0;
  await assert.rejects(createPurchaseWithItems({ input: { ...input, contractNo: 'SYNTHETIC-CUSTOM' }, prismaClient: db }), error => error === duplicateNumber);
  assert.equal(attempts, 1);

  attempts = 0;
  const databaseError = Object.assign(new Error('synthetic unavailable'), { code: 'P2028' });
  await assert.rejects(createPurchaseWithItems({ input, prismaClient: { $transaction: async () => { attempts++; throw databaseError; } } }), error => error === databaseError);
  assert.equal(attempts, 1);
});

test('连续自动编号竞争最多三次，并返回可重试的409', async () => {
  let attempts = 0;
  await assert.rejects(createPurchaseWithItems({
    input: { supplierId: 'synthetic-supplier', items: [{ productId: 'synthetic-product', quantity: 1, unitPrice: 1 }] },
    prismaClient: { $transaction: async () => { attempts++; throw Object.assign(new Error('synthetic transaction conflict'), { code: 'P2034' }); } },
  }), error => error.statusCode === 409);
  assert.equal(attempts, 3);
});
