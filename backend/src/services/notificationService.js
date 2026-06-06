/**
 * Input: 业务数据与通知生成请求
 * Output: 通知的 CRUD 与自动生成逻辑
 * Pos: 通知业务服务层
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const prisma = require('../utils/prisma');

const NOTIFICATION_TYPES = {
  PURCHASE_DRAFT: 'PURCHASE_DRAFT',
  SALES_DRAFT: 'SALES_DRAFT',
  OVERDUE_RECEIVABLE: 'OVERDUE_RECEIVABLE',
  LOW_STOCK: 'LOW_STOCK',
};

/**
 * 职责：获取用户通知列表
 */
const list = async (userId, { page = 1, pageSize = 20 } = {}) => {
  const skip = (page - 1) * pageSize;
  const [items, total] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.notification.count({ where: { userId } }),
  ]);
  return { items, total, page, pageSize };
};

/**
 * 职责：获取用户未读通知数量
 */
const unreadCount = async (userId) => {
  return prisma.notification.count({
    where: { userId, isRead: false },
  });
};

/**
 * 职责：标记单条通知已读
 */
const markRead = async (userId, id) => {
  const notification = await prisma.notification.findUnique({
    where: { id },
  });
  if (!notification || notification.userId !== userId) {
    return null;
  }
  return prisma.notification.update({
    where: { id },
    data: { isRead: true },
  });
};

/**
 * 职责：标记用户全部通知已读
 */
const markAllRead = async (userId) => {
  return prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });
};

/**
 * 职责：根据业务场景为用户生成通知（幂等：同一类型同一天只生成一条）
 * 思路：
 *   1. 检查待起草采购合同
 *   2. 检查待补录出口参数
 *   3. 检查逾期应收款
 *   4. 检查低库存
 */
const generateForUser = async (userId) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const results = [];

  // 1. 待起草采购合同（DRAFT 状态）
  const draftPurchases = await prisma.purchaseContract.findMany({
    where: { status: 'DRAFT' },
    select: { id: true, contractNo: true },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  if (draftPurchases.length > 0) {
    const existing = await prisma.notification.findFirst({
      where: {
        userId,
        type: NOTIFICATION_TYPES.PURCHASE_DRAFT,
        createdAt: { gte: today },
      },
    });
    if (!existing) {
      const titles = draftPurchases.map((c) => c.contractNo).join('、');
      const n = await prisma.notification.create({
        data: {
          userId,
          type: NOTIFICATION_TYPES.PURCHASE_DRAFT,
          title: `有待起草采购合同 ${draftPurchases.length} 份`,
          content: titles + (draftPurchases.length >= 5 ? ' 等' : ''),
          link: '/dashboard/contracts',
        },
      });
      results.push(n);
    }
  }

  // 2. 待补录出口参数（DRAFT/CONFIRMED/PACKING 且缺少箱数/毛重/体积）
  const pendingSales = await prisma.salesContract.findMany({
    where: {
      status: { in: ['DRAFT', 'CONFIRMED', 'PACKING'] },
      OR: [
        { totalBoxes: { lte: 0 } },
        { grossWeight: { lte: 0 } },
        { volume: { lte: 0 } },
      ],
    },
    select: { id: true, contractNo: true },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  if (pendingSales.length > 0) {
    const existing = await prisma.notification.findFirst({
      where: {
        userId,
        type: NOTIFICATION_TYPES.SALES_DRAFT,
        createdAt: { gte: today },
      },
    });
    if (!existing) {
      const titles = pendingSales.map((c) => c.contractNo).join('、');
      const n = await prisma.notification.create({
        data: {
          userId,
          type: NOTIFICATION_TYPES.SALES_DRAFT,
          title: `有待补录出口参数 ${pendingSales.length} 份`,
          content: titles + (pendingSales.length >= 5 ? ' 等' : ''),
          link: '/dashboard/sales',
        },
      });
      results.push(n);
    }
  }

  // 3. 逾期应收款（已发运但已收金额 < 总金额）
  const overdueSales = await prisma.salesContract.findMany({
    where: {
      status: { in: ['SHIPPED', 'ARRIVED', 'COMPLETED'] },
      totalAmount: { gt: prisma.salesContract.fields.receivedAmount },
    },
    select: { id: true, contractNo: true },
    orderBy: { shippedAt: 'desc' },
    take: 5,
  });
  if (overdueSales.length > 0) {
    const existing = await prisma.notification.findFirst({
      where: {
        userId,
        type: NOTIFICATION_TYPES.OVERDUE_RECEIVABLE,
        createdAt: { gte: today },
      },
    });
    if (!existing) {
      const titles = overdueSales.map((c) => c.contractNo).join('、');
      const n = await prisma.notification.create({
        data: {
          userId,
          type: NOTIFICATION_TYPES.OVERDUE_RECEIVABLE,
          title: `有逾期应收款 ${overdueSales.length} 份`,
          content: titles + (overdueSales.length >= 5 ? ' 等' : ''),
          link: '/dashboard/finance',
        },
      });
      results.push(n);
    }
  }

  // 4. 低库存（数量低于预警线，使用 Product.lowStockThreshold）
  const lowStockProducts = await prisma.$queryRaw`
    SELECT p.id, p.customsName, SUM(i.quantity) as totalQty, p.lowStockThreshold
    FROM products p
    LEFT JOIN inventories i ON i.productId = p.id
    WHERE p.isActive = 1
    GROUP BY p.id
    HAVING totalQty < p.lowStockThreshold OR (totalQty IS NULL AND p.lowStockThreshold > 0)
    ORDER BY totalQty ASC
    LIMIT 5
  `;
  if (lowStockProducts.length > 0) {
    const existing = await prisma.notification.findFirst({
      where: {
        userId,
        type: NOTIFICATION_TYPES.LOW_STOCK,
        createdAt: { gte: today },
      },
    });
    if (!existing) {
      const titles = lowStockProducts.map((p) => p.customsName).join('、');
      const n = await prisma.notification.create({
        data: {
          userId,
          type: NOTIFICATION_TYPES.LOW_STOCK,
          title: `有 ${lowStockProducts.length} 个商品库存低于预警线`,
          content: titles + (lowStockProducts.length >= 5 ? ' 等' : ''),
          link: '/dashboard/inventory',
        },
      });
      results.push(n);
    }
  }

  return results;
};

module.exports = {
  NOTIFICATION_TYPES,
  list,
  unreadCount,
  markRead,
  markAllRead,
  generateForUser,
};
