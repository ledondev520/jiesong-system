/**
 * Input: Prisma客户端、库存状态机工具
 * Output: 库存相关的HTTP响应（含单条/批量状态更新）
 * Pos: 库存控制器，处理库存查询、状态变更与批量操作
 * 
 * 2026-01-20 更新：Container已合并到SalesContract
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const prisma = require('../utils/prisma');
const { success, paginated } = require('../utils/response');
const { createError } = require('../middleware/errorHandler');
const { validateInventoryTransition } = require('../utils/inventoryStateMachine');
const { normalizePagination } = require('../utils/pagination');

/**
 * 职责：获取库存列表并支持条件筛选。
 * 思路：
 * 1. 解析分页与筛选参数；
 * 2. 组装 Prisma where 条件；
 * 3. 并行查询列表与总数并返回分页结果。
 * @param {import('express').Request} req 请求对象
 * @param {import('express').Response} res 响应对象
 * @param {import('express').NextFunction} next 错误透传
 * @returns {Promise<void>}
 */
const list = async (req, res, next) => {
  try {
    const { page, pageSize, skip } = normalizePagination(req.query, { pageSize: 20, maxPageSize: 100 });
    const { status, productId, keyword } = req.query;
    
    const where = {};
    if (status) where.status = status;
    if (productId) where.productId = productId;
    if (keyword && keyword.trim()) {
      where.OR = [
        {
          product: {
            customsName: {
              contains: keyword.trim(),
            },
          },
        },
        {
          purchaseItem: {
            purchaseContract: {
              contractNo: {
                contains: keyword.trim(),
              },
            },
          },
        },
      ];
    }
    
    const [inventories, total] = await Promise.all([
      prisma.inventory.findMany({
        where,
        skip,
        take: pageSize,
        include: {
          product: true,
          purchaseItem: { include: { purchaseContract: true } },
          salesContract: { include: { port: true } },  // 原 container
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.inventory.count({ where }),
    ]);
    
    paginated(res, inventories, total, page, pageSize);
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
 * 职责：更新单条库存状态并执行状态机校验。
 * 思路：
 * 1. 读取库存当前状态；
 * 2. 执行状态机规则校验；
 * 3. 校验通过后更新状态及状态时间戳。
 * @param {import('express').Request} req 请求对象
 * @param {import('express').Response} res 响应对象
 * @param {import('express').NextFunction} next 错误透传
 * @returns {Promise<void>}
 */
const updateStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // 0. 获取当前库存状态与关键上下文
    const existingInventory = await prisma.inventory.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        salesContractId: true,
      },
    });
    if (!existingInventory) {
      throw createError('库存记录不存在', 404);
    }

    // 1. 执行状态机校验
    const validationResult = validateInventoryTransition(
      existingInventory.status,
      status,
      existingInventory
    );
    if (!validationResult.valid) {
      throw createError(validationResult.message || '非法库存状态流转', 400);
    }
    
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
 * 职责：批量更新库存状态并返回逐条执行结果。
 * 思路：
 * 1. 校验请求体 ids 与 status；
 * 2. 查询目标库存集合；
 * 3. 逐条执行状态机校验与更新，收集成功/失败明细。
 * @param {import('express').Request} req 请求对象
 * @param {import('express').Response} res 响应对象
 * @param {import('express').NextFunction} next 错误透传
 * @returns {Promise<void>}
 */
const batchUpdateStatus = async (req, res, next) => {
  try {
    const { ids, status } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      throw createError('ids 不能为空数组', 400);
    }
    if (!status) {
      throw createError('status 不能为空', 400);
    }

    const existingInventories = await prisma.inventory.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        status: true,
        salesContractId: true,
      },
    });

    const inventoryMap = new Map(existingInventories.map((item) => [item.id, item]));
    let successCount = 0;
    const errors = [];

    // 0. 逐条校验并更新，确保返回可追踪失败原因
    for (const id of ids) {
      const existingInventory = inventoryMap.get(id);
      if (!existingInventory) {
        errors.push({ id, message: '库存记录不存在' });
        continue;
      }

      const validationResult = validateInventoryTransition(
        existingInventory.status,
        status,
        existingInventory
      );
      if (!validationResult.valid) {
        errors.push({ id, message: validationResult.message || '非法库存状态流转' });
        continue;
      }

      const updateData = { status };
      if (status === 'INBOUND') {
        updateData.inboundAt = new Date();
      } else if (status === 'OUTBOUND') {
        updateData.outboundAt = new Date();
      }

      // 1. 执行更新
      await prisma.inventory.update({
        where: { id },
        data: updateData,
      });
      successCount += 1;
    }

    success(
      res,
      {
        success: successCount,
        failed: errors.length,
        errors,
      },
      '批量状态更新完成'
    );
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
  batchUpdateStatus,
  getByProduct,
  getByContract,  // 原 getByContainer
  getStats,
};
