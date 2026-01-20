/**
 * Input: Prisma客户端
 * Output: 仪表盘统计数据
 * Pos: 仪表盘控制器，提供首页统计数据
 * 
 * 2026-01-20 更新：Container已合并到SalesContract
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const prisma = require('../utils/prisma');
const { success } = require('../utils/response');

/**
 * 职责：获取仪表盘统计数据
 */
const getStats = async (req, res, next) => {
  try {
    // 1. 并行获取各项统计
    const [
      productCount,
      supplierCount,
      storeCount,
      inventoryCount,
      salesContractCount,
      purchaseContractCount,
      pendingPurchases,
      activeSales,
      lowInventory,
      // 出口合同（原货柜）统计
      recentContainers,
      recentSales,
    ] = await Promise.all([
      prisma.product.count(),
      prisma.supplier.count(),
      prisma.store.count(),
      prisma.inventory.count(),
      prisma.salesContract.count(),
      prisma.purchaseContract.count(),
      // 待处理采购（状态为DRAFT或PENDING）
      prisma.purchaseContract.count({
        where: { status: { in: ['DRAFT', 'PENDING'] } },
      }),
      // 进行中销售（状态不是COMPLETED和CANCELLED）
      prisma.salesContract.count({
        where: { status: { notIn: ['COMPLETED', 'CANCELLED'] } },
      }),
      // 低库存预警（数量小于10）
      prisma.inventory.count({
        where: { quantity: { lt: 10 } },
      }),
      // 最近的出口合同（原货柜，现为SalesContract）
      prisma.salesContract.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          contractNo: true,     // 作为货柜号使用
          status: true,
          shippedAt: true,
          createdAt: true,
        },
      }),
      // 最近的销售合同（与上面相同，为兼容前端）
      prisma.salesContract.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          contractNo: true,
          totalAmount: true,
          status: true,
          signedAt: true,
        },
      }),
    ]);

    // 2. 组装返回数据
    // 为兼容前端，将出口合同数量同时赋给 containers
    const data = {
      overview: {
        products: productCount,
        suppliers: supplierCount,
        stores: storeCount,
        containers: salesContractCount,  // 出口合同数 = 货柜数
        inventories: inventoryCount,
        salesContracts: salesContractCount,
        purchaseContracts: purchaseContractCount,
      },
      alerts: {
        pendingPurchases,
        activeSales,
        lowInventory,
      },
      recent: {
        // 将出口合同映射为货柜格式（兼容前端）
        containers: recentContainers.map(c => ({
          id: c.id,
          containerNo: c.contractNo,  // EXP号作为货柜号
          status: c.status,
          shippedAt: c.shippedAt,
          createdAt: c.createdAt,
        })),
        sales: recentSales,
      },
    };

    success(res, data);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getStats,
};
