/**
 * Input: PrismaClient、库存与商品模型
 * Output: 低库存预警列表（只读；不再有定时通知任务）
 * Pos: 库存预警服务，供 API（商品/库存/首页/AI 只读工具）复用
 */

const prisma = require('../utils/prisma');
const { INVENTORY_STATUS } = require('../config/constants');

const normalizeKeyword = (value) => String(value || '').trim();

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

module.exports = {
  buildLowStockAlerts,
  listLowStockAlerts,
};
