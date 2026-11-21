/**
 * Input: inventoryAlertService、prisma
 * Output: 库存预警服务测试
 * Pos: 服务层测试，验证低库存识别
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../utils/prisma');
const { listLowStockAlerts } = require('./inventoryAlertService');

test('listLowStockAlerts: 返回低于阈值的商品并按缺口排序', async () => {
  const originalProductFindMany = prisma.product.findMany;
  const originalInventoryGroupBy = prisma.inventory.groupBy;

  let productWhere = null;
  prisma.product.findMany = async (args) => {
    productWhere = args.where;
    return [
      { id: 'p-1', customsName: '花瓶', unit: '件', lowStockThreshold: 30 },
      { id: 'p-2', customsName: '茶杯', unit: '件', lowStockThreshold: 10 },
    ];
  };
  prisma.inventory.groupBy = async () => ([
    { productId: 'p-1', _sum: { quantity: 12 } },
    { productId: 'p-2', _sum: { quantity: 18 } },
  ]);

  try {
    const checkedAt = new Date('2026-03-05T08:00:00.000Z');
    const result = await listLowStockAlerts(prisma, {
      keyword: '花',
      checkedAt,
    });

    assert.equal(result.alerts.length, 1);
    assert.deepEqual(result.alerts[0], {
      productId: 'p-1',
      productName: '花瓶',
      unit: '件',
      lowStockThreshold: 30,
      currentStock: 12,
      shortage: 18,
      checkedAt: checkedAt.toISOString(),
    });
    assert.deepEqual(productWhere.lowStockThreshold, { gt: 0 });
    assert.ok(Array.isArray(productWhere.OR));
  } finally {
    prisma.product.findMany = originalProductFindMany;
    prisma.inventory.groupBy = originalInventoryGroupBy;
  }
});
