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

test('inventoryController.list: storeName 按采购合同发货店铺只读筛选', async () => {
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
    await list({ query: { storeName: ' 第二店 ', page: '1', pageSize: '20' } }, res, (error) => { throw error; });
    assert.deepEqual(findWhere.purchaseItem, { purchaseContract: { storeName: '第二店' } });
    await list({ query: { page: '1', pageSize: '20' } }, res, (error) => { throw error; });
    assert.equal(findWhere.purchaseItem, undefined);
  } finally {
    prisma.inventory = original;
  }
});
