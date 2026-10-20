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
  applyPurchaseInStock,
  applySalesOutStock,
  revertPurchaseInStock,
  revertSalesOutStock,
} = require('./inventorySnapshot');

test('reconcileSalesFinancials: 按 quantity * 单价 对齐合同金额与成本', async () => {
  const originalFindUnique = prisma.salesContract.findUnique;
  const originalFindMany = prisma.salesItem.findMany;
  const originalUpdate = prisma.salesContract.update;
  let updateArgs = null;

  prisma.salesContract.findUnique = async () => ({ amountSource: 'DERIVED' });
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
    prisma.salesContract.findUnique = originalFindUnique;
    prisma.salesContract.update = originalUpdate;
  }
});

test('reconcileSalesFinancials: 正式合同金额不被销售明细重算覆盖', async () => {
  const originalFindUnique = prisma.salesContract.findUnique;
  const originalFindMany = prisma.salesItem.findMany;
  const originalUpdate = prisma.salesContract.update;
  let updateArgs = null;

  prisma.salesContract.findUnique = async () => ({ amountSource: 'FORMAL_DOCUMENT' });
  prisma.salesItem.findMany = async () => [{ quantity: 2, sellingPrice: 100, costPrice: 40 }];
  prisma.salesContract.update = async (args) => { updateArgs = args; return { id: 'sc-1' }; };

  try {
    const result = await reconcileSalesFinancials(prisma, 'sc-1');
    assert.deepEqual(updateArgs, { where: { id: 'sc-1' }, data: {} });
    assert.equal(result.totalAmount, 200);
  } finally {
    prisma.salesContract.findUnique = originalFindUnique;
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
    purchaseReceipt: { count: async () => 0 },
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
  prisma.salesContract.findUnique = async () => ({ amountSource: 'DERIVED' });


test('旧整单入库能力不能绕过批次验货，已有验货证据不得直接回滚', async () => {
  await assert.rejects(() => applyPurchaseInStock({
    purchaseContract: { findUnique: async () => ({ status: 'SHIPPED', _count: { receipts: 0 }, items: [{ id: 'pi-1', quantity: 10 }] }) },
    purchaseReceiptItem: { groupBy: async () => [] },
    inventory: { findMany: async () => [] },
  }, 'pc-1'), /到货和验货/);
  await assert.rejects(() => revertPurchaseInStock({ purchaseReceipt: { count: async () => 1 } }, 'pc-1'), /不可直接回滚/);
});

test('FIFO拆分和销售回滚保留验货来源及原入库时间', async () => {
  const inboundAt = new Date('2026-10-01T00:00:00Z');
  const stock = { id: 'inv-1', productId: 'product-1', purchaseItemId: 'pi-1', receiptInspectionId: 'inspection-1', inboundAt, quantity: 10, status: 'INBOUND', purchaseItem: { unitPrice: 100 } };
  let child;
  const tx = {
    salesContract: { findUnique: async () => ({ id: 'sc-1', amountSource: 'DERIVED', items: [{ id: 'si-1', productId: 'product-1', quantity: 4 }] }), update: async () => ({}) },
    salesItem: { update: async () => ({}), findMany: async () => [{ quantity: 4, sellingPrice: 150, costPrice: 100 }] },
    inventory: {
      findMany: async ({ where }) => where.status === 'INBOUND' ? [stock] : [child],
      update: async ({ where, data }) => { Object.assign(where.id === stock.id ? stock : child, data); return {}; },
      create: async ({ data }) => { child = { id: 'child-1', ...data }; return child; },
    },
  };
  await applySalesOutStock(tx, 'sc-1');
  assert.equal(stock.quantity, 6);
  assert.equal(child.quantity, 4);
  assert.equal(child.receiptInspectionId, 'inspection-1');
  assert.equal(child.inboundAt, inboundAt);
  await revertSalesOutStock(tx, 'sc-1');
  assert.equal(child.status, 'INBOUND');
  assert.equal(child.receiptInspectionId, 'inspection-1');
  assert.equal(child.inboundAt, inboundAt);
});

test('实际自有出库数量无效时拒绝，不静默跳过装箱或旧销售明细', async () => {
  for (const usePacking of [true, false]) {
    for (const quantity of [0, -1, NaN, Infinity, undefined]) {
      const invalid = { id: 'synthetic-invalid', productId: 'synthetic-product', quantity, isOwnedByJiesong: true };
      let inventoryRead = false;
      const tx = {
        salesContract: { findUnique: async () => ({ id: 'synthetic-sale', items: usePacking ? [] : [invalid], packingItems: usePacking ? [invalid] : [] }) },
        inventory: { findMany: async () => { inventoryRead = true; return []; } },
      };
      await assert.rejects(() => applySalesOutStock(tx, 'synthetic-sale'), error => error.statusCode === 400 && /数量必须为正数/.test(error.message));
      assert.equal(inventoryRead, false, '无效出库量不得读取或扣减库存');
    }
  }
});

test('非自有零值拼柜行不参与自有库存数量校验', async () => {
  const row = { id: 'synthetic-third-party', quantity: 0, isOwnedByJiesong: false };
  let inventoryRead = false;
  const tx = {
    salesContract: {
      findUnique: async () => ({ id: 'synthetic-sale', amountSource: 'DERIVED', items: [], packingItems: [row] }),
      update: async () => ({}),
    },
    salesItem: { findMany: async () => [] },
    inventory: { findMany: async () => { inventoryRead = true; return []; } },
  };
  assert.deepEqual((await applySalesOutStock(tx, 'synthetic-sale')).results, []);
  assert.equal(inventoryRead, false);
});
