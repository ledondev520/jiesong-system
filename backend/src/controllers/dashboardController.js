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

/**
 * 职责：商品追踪 - 根据商品名称和门店查找对应的出口合同
 * 思路：
 *   1. 模糊匹配商品名称
 *   2. 可选匹配门店名称
 *   3. 通过 SalesItem 或 PackingItem 关联找到出口合同
 */
const trackProduct = async (req, res, next) => {
  try {
    const { product, store } = req.query;
    
    if (!product) {
      return success(res, []);
    }
    
    // 1. 构建查询条件
    const whereCondition = {
      product: {
        customsName: { contains: product },
      },
    };
    
    // 如果提供了门店名称，添加门店过滤
    if (store) {
      whereCondition.store = {
        name: { contains: store },
      };
    }
    
    // 2. 从 SalesItem 查询（销售明细）
    const salesItems = await prisma.salesItem.findMany({
      where: whereCondition,
      include: {
        salesContract: {
          include: {
            port: true,
          },
        },
        product: true,
        store: true,
      },
      take: 20,
    });
    
    // 3. 从 PackingItem 查询（装箱明细）
    const packingItems = await prisma.packingItem.findMany({
      where: {
        product: {
          customsName: { contains: product },
        },
        ...(store ? {
          store: {
            name: { contains: store },
          },
        } : {}),
      },
      include: {
        salesContract: {
          include: {
            port: true,
          },
        },
        product: true,
        store: true,
      },
      take: 20,
    });
    
    // 4. 合并结果并去重
    const resultMap = new Map();
    
    // 处理销售明细
    salesItems.forEach(item => {
      const key = `${item.salesContractId}-${item.productId}-${item.storeId}`;
      if (!resultMap.has(key) && item.salesContract) {
        resultMap.set(key, {
          salesContractId: item.salesContractId,
          contractNo: item.salesContract.contractNo,
          portName: item.salesContract.port?.name || '未知',
          status: item.salesContract.status,
          eta: item.salesContract.estimatedArrival 
            ? new Date(item.salesContract.estimatedArrival).toLocaleDateString('zh-CN')
            : null,
          storeName: item.store?.name || '未知门店',
          productName: item.product?.customsName || '未知商品',
          quantity: item.quantity,
        });
      }
    });
    
    // 处理装箱明细
    packingItems.forEach(item => {
      const key = `${item.salesContractId}-${item.productId}-${item.storeId || 'no-store'}`;
      if (!resultMap.has(key) && item.salesContract) {
        resultMap.set(key, {
          salesContractId: item.salesContractId,
          contractNo: item.salesContract.contractNo,
          portName: item.salesContract.port?.name || '未知',
          status: item.salesContract.status,
          eta: item.salesContract.estimatedArrival 
            ? new Date(item.salesContract.estimatedArrival).toLocaleDateString('zh-CN')
            : null,
          storeName: item.store?.name || '未知门店',
          productName: item.product?.customsName || '未知商品',
          quantity: item.quantity,
        });
      }
    });
    
    // 5. 按合同编号排序返回
    const results = Array.from(resultMap.values())
      .sort((a, b) => b.contractNo.localeCompare(a.contractNo));
    
    success(res, results);
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：获取数据看板详细分析数据
 * 思路：提供合同统计、应收账款、库存概览、出货趋势等
 */
const getAnalytics = async (req, res, next) => {
  try {
    // 1. 合同统计
    const [purchaseStats, salesStats] = await Promise.all([
      prisma.purchaseContract.aggregate({
        _count: true,
        _sum: { totalAmount: true, paidAmount: true },
      }),
      prisma.salesContract.aggregate({
        _count: true,
        _sum: { totalAmount: true, receivedAmount: true },
      }),
    ]);

    // 2. 应收账款（待收美金）
    const receivable = (salesStats._sum.totalAmount || 0) - (salesStats._sum.receivedAmount || 0);
    
    // 3. 库存概览
    const [inventoryStats, productCount] = await Promise.all([
      prisma.inventory.aggregate({
        _count: true,
        _sum: { quantity: true },
      }),
      prisma.product.count(),
    ]);

    // 4. 按月出货统计（最近6个月）
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    const monthlyShipments = await prisma.salesContract.groupBy({
      by: ['status'],
      where: {
        shippedAt: { gte: sixMonthsAgo },
        status: { in: ['SHIPPED', 'ARRIVED', 'COMPLETED'] },
      },
      _count: true,
      _sum: { totalAmount: true, totalBoxes: true },
    });

    // 获取按月统计的出口合同（使用签订日期signedAt作为出货月份）
    const contracts = await prisma.salesContract.findMany({
      where: {
        signedAt: { not: null, gte: sixMonthsAgo },
      },
      select: { signedAt: true, totalAmount: true, totalBoxes: true },
    });
    
    // 按月聚合
    const monthMap = new Map();
    contracts.forEach(c => {
      if (c.signedAt) {
        const month = c.signedAt.toISOString().substring(0, 7);
        if (!monthMap.has(month)) {
          monthMap.set(month, { month, count: 0, amount: 0, boxes: 0 });
        }
        const m = monthMap.get(month);
        m.count++;
        m.amount += c.totalAmount || 0;
        m.boxes += c.totalBoxes || 0;
      }
    });
    const salesByMonth = Array.from(monthMap.values()).sort((a, b) => b.month.localeCompare(a.month));

    // 5. 热门采购商品（Top 10）
    const topProducts = await prisma.packingItem.groupBy({
      by: ['productId'],
      _sum: { quantity: true, totalPrice: true },
      _count: true,
      orderBy: { _count: { productId: 'desc' } },
      take: 10,
    });

    // 获取商品名称
    const productIds = topProducts.map(p => p.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, customsName: true },
    });
    const productMap = new Map(products.map(p => [p.id, p.customsName]));

    const topProductsWithNames = topProducts.map(p => ({
      productName: productMap.get(p.productId) || '未知',
      count: p._count,
      quantity: p._sum.quantity,
      totalAmount: p._sum.totalPrice,
    }));

    // 6. 门店统计
    const storeStats = await prisma.packingItem.groupBy({
      by: ['storeId'],
      _sum: { totalPrice: true, quantity: true },
      _count: true,
      where: { storeId: { not: null } },
    });

    const storeIds = storeStats.map(s => s.storeId).filter(Boolean);
    const stores = await prisma.store.findMany({
      where: { id: { in: storeIds } },
      select: { id: true, name: true },
    });
    const storeMap = new Map(stores.map(s => [s.id, s.name]));

    const storeStatsWithNames = storeStats.map(s => ({
      storeName: storeMap.get(s.storeId) || '未知',
      orderCount: s._count,
      quantity: s._sum.quantity,
      totalAmount: s._sum.totalPrice,
    })).sort((a, b) => (b.totalAmount || 0) - (a.totalAmount || 0));

    // 组装返回数据
    const data = {
      contracts: {
        purchase: {
          count: purchaseStats._count,
          totalAmount: purchaseStats._sum.totalAmount || 0,
          paidAmount: purchaseStats._sum.paidAmount || 0,
          unpaidAmount: (purchaseStats._sum.totalAmount || 0) - (purchaseStats._sum.paidAmount || 0),
        },
        sales: {
          count: salesStats._count,
          totalAmount: salesStats._sum.totalAmount || 0,
          receivedAmount: salesStats._sum.receivedAmount || 0,
          receivable,
        },
      },
      inventory: {
        productCount,
        recordCount: inventoryStats._count,
        totalQuantity: inventoryStats._sum.quantity || 0,
      },
      shipments: {
        monthly: salesByMonth,
        summary: monthlyShipments,
      },
      topProducts: topProductsWithNames,
      storeStats: storeStatsWithNames.slice(0, 10),
    };

    success(res, data);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getStats,
  trackProduct,
  getAnalytics,
};
