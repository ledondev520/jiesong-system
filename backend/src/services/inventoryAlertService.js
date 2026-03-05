/**
 * Input: PrismaClient、库存与商品模型
 * Output: 低库存预警列表与通知下发能力
 * Pos: 库存预警服务，供 API 与定时任务复用
 */

const prisma = require('../utils/prisma');
const { INVENTORY_STATUS, NOTIFICATION_TYPE, ROLES } = require('../config/constants');

const DEFAULT_NOTIFY_ROLES = [ROLES.ADMIN, ROLES.PURCHASE, ROLES.WAREHOUSE];

const normalizeKeyword = (value) => String(value || '').trim();

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toTodayStart = (value = new Date()) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const safeParseMetadata = (metadata) => {
  if (!metadata) {
    return null;
  }

  try {
    return JSON.parse(metadata);
  } catch (error) {
    return null;
  }
};

const buildAlertTitle = (productName) => `库存预警：${productName}`;

const buildAlertContent = (alert) => {
  const unit = alert.unit || '';
  return `当前库存 ${alert.currentStock}${unit}，低于阈值 ${alert.lowStockThreshold}${unit}`;
};

const buildLowStockAlerts = (products = [], stockRows = [], checkedAt = new Date()) => {
  const stockMap = new Map(
    stockRows.map((row) => [row.productId, toNumber(row?._sum?.quantity, 0)]),
  );

  const alerts = products
    .map((product) => {
      const currentStock = toNumber(stockMap.get(product.id), 0);
      const lowStockThreshold = toNumber(product.lowStockThreshold, 0);
      const shortage = lowStockThreshold - currentStock;

      return {
        productId: product.id,
        productName: product.customsName,
        unit: product.unit || null,
        lowStockThreshold,
        currentStock,
        shortage: shortage > 0 ? shortage : 0,
        checkedAt: checkedAt.toISOString(),
      };
    })
    .filter((item) => item.currentStock + 1e-9 < item.lowStockThreshold)
    .sort((a, b) => {
      if (b.shortage !== a.shortage) {
        return b.shortage - a.shortage;
      }
      return a.productName.localeCompare(b.productName, 'zh-CN');
    });

  return alerts;
};

const listLowStockAlerts = async (tx = prisma, options = {}) => {
  const checkedAt = options.checkedAt instanceof Date ? options.checkedAt : new Date();
  const keyword = normalizeKeyword(options.keyword);

  const productWhere = {
    isActive: true,
    lowStockThreshold: { gt: 0 },
  };
  if (keyword) {
    productWhere.OR = [
      { customsName: { contains: keyword } },
      { description: { contains: keyword } },
    ];
  }

  const products = await tx.product.findMany({
    where: productWhere,
    select: {
      id: true,
      customsName: true,
      unit: true,
      lowStockThreshold: true,
    },
  });

  if (products.length === 0) {
    return {
      alerts: [],
      checkedAt: checkedAt.toISOString(),
    };
  }

  const stockRows = await tx.inventory.groupBy({
    by: ['productId'],
    where: {
      productId: { in: products.map((item) => item.id) },
      status: INVENTORY_STATUS.INBOUND,
    },
    _sum: {
      quantity: true,
    },
  });

  return {
    alerts: buildLowStockAlerts(products, stockRows, checkedAt),
    checkedAt: checkedAt.toISOString(),
  };
};

const createLowStockNotifications = async (tx = prisma, alerts = [], options = {}) => {
  if (!Array.isArray(alerts) || alerts.length === 0) {
    return {
      created: 0,
      skipped: 0,
      recipients: 0,
    };
  }

  const roles = Array.isArray(options.notifyRoles) && options.notifyRoles.length > 0
    ? options.notifyRoles
    : DEFAULT_NOTIFY_ROLES;

  const users = await tx.user.findMany({
    where: {
      isActive: true,
      role: { in: roles },
    },
    select: { id: true },
  });

  if (users.length === 0) {
    return {
      created: 0,
      skipped: alerts.length,
      recipients: 0,
    };
  }

  const userIds = users.map((item) => item.id);
  const todayStart = options.todayStart instanceof Date ? options.todayStart : toTodayStart();
  const existing = await tx.notification.findMany({
    where: {
      type: NOTIFICATION_TYPE.LOW_STOCK,
      userId: { in: userIds },
      createdAt: { gte: todayStart },
    },
    select: {
      userId: true,
      metadata: true,
    },
  });

  const existingKeys = new Set();
  existing.forEach((item) => {
    const metadata = safeParseMetadata(item.metadata);
    if (metadata?.productId) {
      existingKeys.add(`${item.userId}:${metadata.productId}`);
    }
  });

  const rows = [];
  alerts.forEach((alert) => {
    users.forEach((user) => {
      const dedupeKey = `${user.id}:${alert.productId}`;
      if (existingKeys.has(dedupeKey)) {
        return;
      }

      rows.push({
        userId: user.id,
        type: NOTIFICATION_TYPE.LOW_STOCK,
        title: buildAlertTitle(alert.productName),
        content: buildAlertContent(alert),
        metadata: JSON.stringify({
          productId: alert.productId,
          productName: alert.productName,
          currentStock: alert.currentStock,
          lowStockThreshold: alert.lowStockThreshold,
          checkedAt: alert.checkedAt,
        }),
      });
    });
  });

  if (rows.length > 0) {
    await tx.notification.createMany({
      data: rows,
    });
  }

  return {
    created: rows.length,
    skipped: alerts.length * users.length - rows.length,
    recipients: users.length,
  };
};

const runDailyLowStockAlertCheck = async (tx = prisma, options = {}) => {
  const { alerts, checkedAt } = await listLowStockAlerts(tx, options);
  const notificationResult = await createLowStockNotifications(tx, alerts, options);

  return {
    checkedAt,
    alertCount: alerts.length,
    ...notificationResult,
  };
};

module.exports = {
  buildLowStockAlerts,
  listLowStockAlerts,
  createLowStockNotifications,
  runDailyLowStockAlertCheck,
};
