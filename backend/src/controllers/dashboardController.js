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
const { generateForUser } = require('../services/notificationService');
const { buildSalesFinanceSummary } = require('../services/salesFinanceService');
const { getOverdueReceivables, getStats: getFinanceStats } = require('../services/financeService');
const { listLowStockAlerts } = require('../services/inventoryAlertService');
const { parseShanghaiDateRange } = require('../utils/dateRange');
const { listTradeWorkflows } = require('../services/tradeWorkflowService');

/**
 * 职责：返回按出口合同聚合的专项单主线路，供工作台展示唯一下一动作。
 */
const getTradeWorkflows = async (req, res, next) => {
  try {
    const workflows = await listTradeWorkflows({ limit: req.query?.limit, scope: req.query?.scope });
    success(res, workflows);
  } catch (error) {
    next(error);
  }
};

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
      // 最近的出口合同
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
      // 最近的销售合同
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
    // 为页面展示，将出口合同数量同时赋给 containers
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
        // 最近的出口合同（货柜管理使用 contractNo 作为唯一编号）
        containers: recentContainers.map(c => ({
          id: c.id,
          contractNo: c.contractNo,
          status: c.status,
          shippedAt: c.shippedAt,
          createdAt: c.createdAt,
        })),
        sales: recentSales,
      },
    };

    // 3. 异步生成通知（不阻塞响应）
    if (req.user?.id && req.user.role !== 'BOSS') {
      generateForUser(req.user.id).catch(() => {});
    }

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
    const [purchaseStats, salesStats, financeStats, draftPurchases, exportPendingParams] = await Promise.all([
      prisma.purchaseContract.aggregate({
        where: { status: { not: 'CANCELLED' } },
        _count: true,
        _sum: { totalAmount: true, paidAmount: true },
      }),
      prisma.salesContract.aggregate({
        where: { status: { not: 'CANCELLED' } },
        _count: true,
        _sum: { totalAmount: true, receivedAmount: true },
      }),
      getFinanceStats(),
      prisma.purchaseContract.count({ where: { status: 'DRAFT' } }),
      prisma.salesContract.count({ where: { status: { in: ['DRAFT', 'CONFIRMED', 'PACKING'] }, OR: [{ totalBoxes: { lte: 0 } }, { grossWeight: { lte: 0 } }, { volume: { lte: 0 } }] } }),
    ]);

    // 2. 应收账款（待收美金）
    const receivable = financeStats.receivable.unreceived;
    
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
      alerts: { draftPurchases, exportPendingParams },
      contracts: {
        purchase: {
          count: purchaseStats._count,
          totalAmount: purchaseStats._sum.totalAmount || 0,
          paidAmount: purchaseStats._sum.paidAmount || 0,
          unpaidAmount: financeStats.payable.unpaid,
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

/**
 * 职责：按发运期间汇总自有商品人民币毛利；资金与库存是当前全量快照。
 * 复用单柜财务 Interface；本报表不估算退税，不作为公司净利润。
 */
const getBusinessOverview = async (req, res, next) => {
  try {
    const { gte: start, lte: end } = parseShanghaiDateRange(req.query?.startDate, req.query?.endDate);
    const [sales, purchases, productCount, inTransitContainers, overdue, lowStock] = await Promise.all([
      prisma.salesContract.findMany({
        where: { status: { not: 'CANCELLED' } },
        include: { packingItems: true, payments: true, taxRefunds: true },
      }),
      prisma.purchaseContract.findMany({
        where: { status: { not: 'CANCELLED' } },
        select: { id: true, contractNo: true, totalAmount: true, paidAmount: true, expectedDate: true },
      }),
      prisma.product.count({ where: { isActive: true } }),
      prisma.salesContract.count({ where: { status: 'SHIPPED' } }),
      getOverdueReceivables(),
      listLowStockAlerts(prisma),
    ]);
    const round = (value) => Number(value.toFixed(2));
    const sum = (items, pick) => round(items.reduce((total, item) => total + Number(pick(item) || 0), 0));
    // ponytail: 逐合同复用现有单柜计算；规模扩大后再共享批量采购索引。
    const allSummaries = sales.map((contract) => ({
      contract,
      summary: buildSalesFinanceSummary({ salesContract: contract, purchases }),
    }));
    const sold = allSummaries.filter(({ contract }) => {
      const shipped = contract.shippedAt && new Date(contract.shippedAt);
      return ['SHIPPED', 'ARRIVED', 'COMPLETED'].includes(contract.status) && shipped
        && (!start || shipped >= start) && (!end || shipped <= end);
    });
    const unavailable = sold.filter(({ contract, summary }) => !summary.marginReady || !contract.packingItems?.length);
    const marginReady = unavailable.length === 0;
    const revenueReady = sold.every(({ summary }) => summary.currencyPolicy.conversionRate !== null);
    const totalSales = revenueReady ? sum(sold, ({ summary }) => summary.profit.expectedRevenueCny) : null;
    const totalPurchases = marginReady ? sum(sold, ({ summary }) => summary.cost.purchaseCostCny) : null;
    const grossProfit = marginReady ? sum(sold, ({ summary }) => summary.profit.estimatedGrossProfitCny) : null;
    const cashReady = marginReady && sold.every(({ summary }) => summary.cashReady && !summary.issues.some((issue) =>
      ['PURCHASE_CONTRACT_NOT_FOUND', 'MISSING_PURCHASE_LINK', 'MISSING_PURCHASE_COST'].includes(issue.code)));
    const trendStart = new Date();
    trendStart.setMonth(trendStart.getMonth() - 5, 1);
    trendStart.setHours(0, 0, 0, 0);
    const months = new Map();
    sold.filter(({ contract }) => start || end || new Date(contract.shippedAt) >= trendStart).forEach(({ contract, summary }) => {
      const month = new Date(new Date(contract.shippedAt).getTime() + 8 * 3600000).toISOString().slice(0, 7);
      const current = months.get(month) || { month, amount: 0 };
      current.amount = current.amount === null || summary.currencyPolicy.conversionRate === null
        ? null : round(current.amount + summary.profit.expectedRevenueCny);
      months.set(month, current);
    });
    success(res, {
      period: { startDate: req.query?.startDate || null, endDate: req.query?.endDate || null, dateField: 'shippedAt' },
      overview: {
        totalSales, totalPurchases, grossProfit,
        profitMargin: marginReady && totalSales > 0 ? grossProfit / totalSales : marginReady ? 0 : null,
        marginReady, cashReady, currency: 'CNY', contractCount: sold.length,
        netCashCny: cashReady ? sum(sold, ({ summary }) => summary.cashFlow.netCashCny) : null,
        scope: '发运商品口径：自有美元收入按各合同汇率折算 − 对应装箱明细含税采购成本；不含预计退税、海运、报关、银行及管理费用。资金/库存风险为当前全量快照。',
        unavailableContracts: unavailable.map(({ contract, summary }) => ({
          id: contract.id,
          reasons: contract.packingItems?.length ? summary.issues.filter((issue) => issue.severity === 'error').map((issue) => issue.message) : ['缺少装箱明细，无法匹配已售成本'],
        })),
      },
      funds: {
        totalReceivable: sum(allSummaries, ({ summary }) => summary.revenue.outstandingUsd),
        totalPayable: sum(purchases, (contract) => Math.max(contract.totalAmount - contract.paidAmount, 0)),
        overdueReceivable: sum(overdue, (contract) => contract.unreceived),
        overduePayable: sum(purchases.filter((contract) => contract.expectedDate && new Date(contract.expectedDate) < new Date()),
          (contract) => Math.max(contract.totalAmount - contract.paidAmount, 0)),
        overdueRule: '发运超过30天仍未收齐；这是运营预警，不代表已核对合同付款到期条款',
      },
      inventory: {
        totalItems: productCount,
        lowStockItems: lowStock.alerts.length,
        inTransitContainers,
      },
      trends: { monthlySales: Array.from(months.values()).sort((a, b) => a.month.localeCompare(b.month)) },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getStats,
  trackProduct,
  getAnalytics,
  getBusinessOverview,
  getTradeWorkflows,
};
