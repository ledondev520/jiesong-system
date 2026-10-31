/**
 * Input: inventoryController 模块
 * Output: 模块导出冒烟测试
 * Pos: 自动补齐基础测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');

test('inventoryController: 模块可正常加载并导出', () => {
  const mod = require('./inventoryController');
  assert.ok(mod !== undefined);
  assert.equal(typeof mod.getAlerts, 'function');
});

test('inventoryController.list: storeId 按采购明细送往门店只读筛选（不再用已退役的 PurchaseContract.storeName）', async () => {
  const prisma = require('../utils/prisma');
  const { list } = require('./inventoryController');
  const original = prisma.inventory;
  let findWhere;
  prisma.inventory = {
    findMany: async (args) => { findWhere = args.where; return []; },
    count: async () => 0,
  };
  try {
    const res = { status() { return this; }, json() { return this; } };
    await list({ query: { storeId: ' store-2 ', page: '1', pageSize: '20' } }, res, (error) => { throw error; });
    assert.deepEqual(findWhere.purchaseItem, { storeId: 'store-2' });
    // 旧的 storeName 参数不再起筛选作用
    await list({ query: { storeName: '第二店', page: '1', pageSize: '20' } }, res, (error) => { throw error; });
    assert.equal(findWhere.purchaseItem, undefined);
    await list({ query: { page: '1', pageSize: '20' } }, res, (error) => { throw error; });
    assert.equal(findWhere.purchaseItem, undefined);
  } finally {
    prisma.inventory = original;
  }
});
