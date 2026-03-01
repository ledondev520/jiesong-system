/**
 * Input: Prisma客户端
 * Output: 出口合同相关的HTTP响应
 * Pos: 销售控制器，处理出口合同CRUD请求（含装箱管理）
 * 
 * 2026-01-20 重构：合并货柜功能到出口合同，EXP号即货柜号
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const prisma = require('../utils/prisma');
const { success, created, paginated } = require('../utils/response');
const { createError } = require('../middleware/errorHandler');
const { normalizePagination } = require('../utils/pagination');

/**
 * 职责：获取出口合同列表
 * 思路：支持关键字搜索合同编号
 */
const list = async (req, res, next) => {
  try {
    const { page, pageSize, skip } = normalizePagination(req.query, { pageSize: 20, maxPageSize: 100 });
    const { status, storeId, keyword } = req.query;
    
    const where = {};
    if (status) where.status = status;
    if (storeId) {
      where.items = { some: { storeId } };
    }
    if (keyword) {
      where.contractNo = { contains: keyword };
    }
    
    const [contracts, total] = await Promise.all([
      prisma.salesContract.findMany({
        where,
        skip,
        take: pageSize,
        include: { 
          port: true, // 包含港口信息
          _count: { select: { items: true } },
        },
        orderBy: { contractNo: 'desc' },
      }),
      prisma.salesContract.count({ where }),
    ]);
    
    paginated(res, contracts, total, page, pageSize);
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：获取出口合同详情（包含装箱明细）
 */
const getById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const contract = await prisma.salesContract.findUnique({
      where: { id },
      include: {
        port: true,
        items: {
          include: {
            product: true,
            store: { include: { port: true } },
          },
        },
        packingItems: {
          include: {
            product: true,
            store: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        payments: true,
      },
    });
    
    if (!contract) {
      throw createError('出口合同不存在', 404);
    }
    
    success(res, contract);
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：创建出口合同
 */
const create = async (req, res, next) => {
  try {
    const data = req.body;
    
    // 生成合同编号
    const year = new Date().getFullYear().toString().slice(-2);
    const count = await prisma.salesContract.count({
      where: { contractNo: { startsWith: `EXP${year}` } },
    });
    const contractNo = `EXP${year}${String(count + 1).padStart(5, '0')}`;
    
    const contract = await prisma.salesContract.create({
      data: {
        contractNo,
        exchangeRate: data.exchangeRate,
        signedAt: data.signedAt ? new Date(data.signedAt) : null,
        note: data.note,
      },
    });
    
    created(res, contract, '出口合同创建成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：更新出口合同
 */
const update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = req.body;
    
    const contract = await prisma.salesContract.update({
      where: { id },
      data: {
        exchangeRate: data.exchangeRate,
        signedAt: data.signedAt ? new Date(data.signedAt) : undefined,
        estimatedArrival: data.estimatedArrival ? new Date(data.estimatedArrival) : undefined,
        portId: data.portId || undefined,
        note: data.note,
      },
    });
    
    success(res, contract, '出口合同更新成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：删除出口合同
 */
const remove = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    await prisma.salesContract.delete({ where: { id } });
    
    success(res, null, '出口合同删除成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：添加销售明细
 */
const addItem = async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = req.body;
    
    // 获取合同汇率
    const contract = await prisma.salesContract.findUnique({ where: { id } });
    
    // 计算销售价：成本价 / 汇率 * 1.3
    const sellingPrice = data.sellingPrice || 
      (data.costPrice / contract.exchangeRate * 1.3);
    
    const item = await prisma.salesItem.create({
      data: {
        salesContractId: id,
        productId: data.productId,
        storeId: data.storeId,
        quantity: data.quantity,
        unit: data.unit,
        costPrice: data.costPrice,
        sellingPrice,
        specification: data.specification,
        note: data.note,
      },
      include: { product: true, store: true },
    });
    
    // 更新合同总金额
    const total = await prisma.salesItem.aggregate({
      where: { salesContractId: id },
      _sum: { sellingPrice: true },
    });
    
    await prisma.salesContract.update({
      where: { id },
      data: { totalAmount: total._sum.sellingPrice || 0 },
    });
    
    created(res, item, '销售明细添加成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：更新合同状态
 */
const updateStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const contract = await prisma.salesContract.update({
      where: { id },
      data: { status },
    });
    
    success(res, contract, '状态更新成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：获取下一个合同编号
 */
const getNextContractNo = async (req, res, next) => {
  try {
    const year = new Date().getFullYear().toString().slice(-2);
    const count = await prisma.salesContract.count({
      where: { contractNo: { startsWith: `EXP${year}` } },
    });
    const contractNo = `EXP${year}${String(count + 1).padStart(5, '0')}`;
    
    success(res, { contractNo });
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：计算销售价格
 * 思路：成本价(RMB) / 汇率 * 利润率(1.3) = 销售价(USD)
 */
const calculatePrice = async (req, res, next) => {
  try {
    const costPrice = Number(req.body?.costPrice);
    const exchangeRate = Number(req.body?.exchangeRate);
    const profitRate = Number(req.body?.profitRate ?? 1.3);

    if (!Number.isFinite(costPrice) || !Number.isFinite(exchangeRate) || !Number.isFinite(profitRate)) {
      throw createError('costPrice、exchangeRate 和 profitRate 必须为数字', 400);
    }
    if (exchangeRate <= 0) {
      throw createError('exchangeRate 必须大于0', 400);
    }
    
    const sellingPrice = costPrice / exchangeRate * profitRate;
    const roundedUp = Math.ceil(sellingPrice);
    const roundedDown = Math.floor(sellingPrice);
    
    success(res, {
      exact: sellingPrice.toFixed(2),
      roundedUp,
      roundedDown,
      recommended: Math.round(sellingPrice),
    });
  } catch (error) {
    next(error);
  }
};

// ==================== 装箱明细管理 ====================

/**
 * 职责：添加装箱明细
 * 思路：接收单价，自动计算总价，更新合同总金额
 */
const addPackingItem = async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = req.body;
    
    // 自动计算总价 = 单价 × 数量
    const unitPrice = data.unitPrice || null;
    const totalPrice = unitPrice && data.quantity ? unitPrice * data.quantity : null;
    
    const item = await prisma.packingItem.create({
      data: {
        salesContractId: id,
        productId: data.productId,
        storeId: data.storeId || null,
        quantity: data.quantity,
        unit: data.unit,
        boxes: data.boxes,
        grossWeight: data.grossWeight,
        netWeight: data.netWeight,
        volume: data.volume,
        unitPrice,
        totalPrice,
        // 商品规格尺寸（用于3D可视化）
        length: data.length || null,
        width: data.width || null,
        height: data.height || null,
        note: data.note,
      },
      include: { product: true, store: true },
    });
    
    // 更新合同汇总数据（含总金额）
    await recalculateContractStats(id);
    
    created(res, item, '装箱明细添加成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：更新装箱明细
 * 思路：接收单价，自动计算总价，更新合同总金额
 */
const updatePackingItem = async (req, res, next) => {
  try {
    const { id, itemId } = req.params;
    const data = req.body;
    
    // 自动计算总价 = 单价 × 数量
    const unitPrice = data.unitPrice || null;
    const totalPrice = unitPrice && data.quantity ? unitPrice * data.quantity : null;
    
    const item = await prisma.packingItem.update({
      where: { id: itemId },
      data: {
        quantity: data.quantity,
        unit: data.unit,
        boxes: data.boxes,
        grossWeight: data.grossWeight,
        netWeight: data.netWeight,
        volume: data.volume,
        unitPrice,
        totalPrice,
        storeId: data.storeId || null,
        // 商品规格尺寸（用于3D可视化）
        length: data.length || null,
        width: data.width || null,
        height: data.height || null,
        note: data.note,
      },
      include: { product: true, store: true },
    });
    
    // 更新合同汇总数据（含总金额）
    await recalculateContractStats(id);
    
    success(res, item, '装箱明细更新成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：删除装箱明细
 */
const removePackingItem = async (req, res, next) => {
  try {
    const { id, itemId } = req.params;
    
    await prisma.packingItem.delete({ where: { id: itemId } });
    
    // 更新合同汇总数据
    await recalculateContractStats(id);
    
    success(res, null, '装箱明细删除成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：重新计算合同装箱汇总数据（含总金额）
 * @param {string} contractId - 合同ID
 */
const recalculateContractStats = async (contractId) => {
  const stats = await prisma.packingItem.aggregate({
    where: { salesContractId: contractId },
    _sum: { boxes: true, grossWeight: true, netWeight: true, volume: true, totalPrice: true },
  });
  
  await prisma.salesContract.update({
    where: { id: contractId },
    data: {
      totalBoxes: stats._sum.boxes || 0,
      grossWeight: stats._sum.grossWeight || 0,
      netWeight: stats._sum.netWeight || 0,
      volume: stats._sum.volume || 0,
      totalAmount: stats._sum.totalPrice || 0, // 从装箱明细汇总总金额
    },
  });
};

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
  addItem,
  updateStatus,
  getNextContractNo,
  calculatePrice,
  addPackingItem,
  updatePackingItem,
  removePackingItem,
};
