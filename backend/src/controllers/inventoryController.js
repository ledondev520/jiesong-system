/**
 * Input: Prisma客户端
 * Output: 库存相关的HTTP响应
 * Pos: 库存控制器，处理库存查询和状态变更
 * 
 * 2026-01-20 更新：Container已合并到SalesContract
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const prisma = require('../utils/prisma');
const { success, paginated } = require('../utils/response');
const { createError } = require('../middleware/errorHandler');

/**
 * 职责：获取库存列表
 */
const list = async (req, res, next) => {
  try {
    const { page = 1, pageSize = 20, status, productId } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(pageSize);
    
    const where = {};
    if (status) where.status = status;
    if (productId) where.productId = productId;
    
    const [inventories, total] = await Promise.all([
      prisma.inventory.findMany({
        where,
        skip,
        take: parseInt(pageSize),
        include: {
          product: true,
          purchaseItem: { include: { purchaseContract: true } },
          salesContract: { include: { port: true } },  // 原 container
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.inventory.count({ where }),
    ]);
    
    paginated(res, inventories, total, parseInt(page), parseInt(pageSize));
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：获取库存详情
 */
const getById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const inventory = await prisma.inventory.findUnique({
      where: { id },
      include: {
        product: true,
        purchaseItem: { include: { purchaseContract: true } },
        salesItem: { include: { salesContract: true, store: true } },
        salesContract: { include: { port: true } },  // 原 container
      },
    });
    
    if (!inventory) {
      throw createError('库存记录不存在', 404);
    }
    
    success(res, inventory);
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：更新库存状态
 */
const updateStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const updateData = { status };
    
    // 根据状态更新时间
    if (status === 'INBOUND') {
      updateData.inboundAt = new Date();
    } else if (status === 'OUTBOUND') {
      updateData.outboundAt = new Date();
    }
    
    const inventory = await prisma.inventory.update({
      where: { id },
      data: updateData,
    });
    
    success(res, inventory, '状态更新成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：按商品查询库存
 */
const getByProduct = async (req, res, next) => {
  try {
    const { productId } = req.params;
    
    const inventories = await prisma.inventory.findMany({
      where: { productId },
      include: {
        salesContract: { include: { port: true } },  // 原 container
      },
      orderBy: { createdAt: 'desc' },
    });
    
    // 计算汇总
    const summary = {
      total: inventories.reduce((sum, inv) => sum + inv.quantity, 0),
      byStatus: {},
    };
    
    inventories.forEach(inv => {
      if (!summary.byStatus[inv.status]) {
        summary.byStatus[inv.status] = 0;
      }
      summary.byStatus[inv.status] += inv.quantity;
    });
    
    success(res, { inventories, summary });
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：按出口合同查询库存（原按货柜查询）
 */
const getByContract = async (req, res, next) => {
  try {
    const { contractId } = req.params;
    
    const inventories = await prisma.inventory.findMany({
      where: { salesContractId: contractId },
      include: { product: true },
    });
    
    success(res, inventories);
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：获取库存统计
 */
const getStats = async (req, res, next) => {
  try {
    const stats = await prisma.inventory.groupBy({
      by: ['status'],
      _count: true,
      _sum: { quantity: true },
    });
    
    const formatted = stats.reduce((acc, item) => {
      acc[item.status] = {
        count: item._count,
        quantity: item._sum.quantity,
      };
      return acc;
    }, {});
    
    success(res, formatted);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  list,
  getById,
  updateStatus,
  getByProduct,
  getByContract,  // 原 getByContainer
  getStats,
};
