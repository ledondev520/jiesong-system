/**
 * Input: inventoryAlertService、prisma
 * Output: 库存预警服务测试
 * Pos: 服务层测试，验证低库存识别与通知去重
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../utils/prisma');
const {
  listLowStockAlerts,
  createLowStockNotifications,
  runDailyLowStockAlertCheck,
} = require('./inventoryAlertService');

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

test('createLowStockNotifications: 同日同商品去重，仅创建缺失通知', async () => {
  const originalUserFindMany = prisma.user.findMany;
  const originalNotificationFindMany = prisma.notification.findMany;
  const originalNotificationCreateMany = prisma.notification.createMany;

  let createManyArgs = null;
  prisma.user.findMany = async () => ([
    { id: 'u-admin' },
    { id: 'u-warehouse' },
  ]);
  prisma.notification.findMany = async () => ([
    {
      userId: 'u-admin',
      metadata: JSON.stringify({ productId: 'p-1' }),
    },
  ]);
  prisma.notification.createMany = async (args) => {
    createManyArgs = args;
    return { count: args.data.length };
  };

  try {
    const alerts = [
      {
        productId: 'p-1',
        productName: '花瓶',
        unit: '件',
        lowStockThreshold: 30,
        currentStock: 12,
        shortage: 18,
        checkedAt: '2026-03-05T08:00:00.000Z',
      },
    ];

    const result = await createLowStockNotifications(prisma, alerts, {
      todayStart: new Date('2026-03-05T00:00:00.000Z'),
    });

    assert.equal(result.created, 1);
    assert.equal(result.skipped, 1);
    assert.equal(result.recipients, 2);
    assert.ok(Array.isArray(createManyArgs.data));
    assert.equal(createManyArgs.data.length, 1);
    assert.equal(createManyArgs.data[0].userId, 'u-warehouse');
    assert.equal(createManyArgs.data[0].type, 'LOW_STOCK');
  } finally {
    prisma.user.findMany = originalUserFindMany;
    prisma.notification.findMany = originalNotificationFindMany;
    prisma.notification.createMany = originalNotificationCreateMany;
  }
});

test('runDailyLowStockAlertCheck: 无阈值商品时返回零告警', async () => {
  const originalProductFindMany = prisma.product.findMany;
  const originalUserFindMany = prisma.user.findMany;

  prisma.product.findMany = async () => [];
  prisma.user.findMany = async () => {
    throw new Error('不应在无告警时查询用户');
  };

  try {
    const result = await runDailyLowStockAlertCheck(prisma, {
      checkedAt: new Date('2026-03-05T09:00:00.000Z'),
    });

    assert.equal(result.alertCount, 0);
    assert.equal(result.created, 0);
    assert.equal(result.recipients, 0);
  } finally {
    prisma.product.findMany = originalProductFindMany;
    prisma.user.findMany = originalUserFindMany;
  }
});
