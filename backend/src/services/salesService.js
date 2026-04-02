const prisma = require('../utils/prisma');
const { createError } = require('../middleware/errorHandler');
const {
  generateNextContractNo,
  normalizeFilterStatus,
  parseNullableNumber,
} = require('./shared/contractUtils');
const { SALES_STATUS, validateSalesTransition } = require('./salesStateMachine');
const inventorySnapshot = require('./inventorySnapshot');

const getCurrentYear = () => new Date().getFullYear().toString().slice(-2);

const getThirdPartySources = (packingItems = []) => Array.from(new Set(
  packingItems
    .filter((item) => item.isOwnedByJiesong === false)
    .map((item) => item.sourceParty || '第三方拼柜')
    .filter(Boolean),
));

const getSalesContracts = async ({ page, pageSize, status, storeId, keyword, lite = false }) => {
  const where = {};
  if (status) {
    where.status = normalizeFilterStatus(status);
  }
  if (storeId) {
    where.items = { some: { storeId } };
  }
  if (keyword) {
    where.contractNo = { contains: keyword };
  }

  const skip = (page - 1) * pageSize;
  const [rawContracts, total] = await Promise.all([
    prisma.salesContract.findMany({
      where,
      skip,
      take: pageSize,
      include: lite
        ? {
            port: { select: { id: true, name: true } },
            packingItems: {
              include: {
                store: { select: { id: true, name: true } },
              },
            },
          }
        : {
            port: true,
            packingItems: {
              include: {
                store: { select: { id: true, name: true } },
              },
            },
          },
      orderBy: { contractNo: 'desc' },
    }),
    prisma.salesContract.count({ where }),
  ]);

  // 聚合门店名称去重列表，方便前端直接展示
  const contracts = rawContracts.map((c) => {
    const storeMap = new Map();
    (c.packingItems || []).forEach((item) => {
      if (item.store && !storeMap.has(item.store.id)) {
        storeMap.set(item.store.id, item.store.name);
      }
    });
    const sourceParties = getThirdPartySources(c.packingItems || []);
    return {
      ...c,
      stores: Array.from(storeMap.values()),
      hasThirdPartyCargo: sourceParties.length > 0,
      sourceParties,
      packingItems: undefined,
    };
  });

  return { contracts, total };
};

const getSalesContractById = async (id) => {
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

  const sourceParties = getThirdPartySources(contract.packingItems || []);

  return {
    ...contract,
    hasThirdPartyCargo: sourceParties.length > 0,
    sourceParties,
  };
};

const createSalesContract = async (data = {}) => {
  const year = getCurrentYear();
  const contractNo = data.contractNo || (await generateNextContractNo({ prisma, year }));
  const exchangeRate = parseNullableNumber(data.exchangeRate, 7.0);

  const contract = await prisma.salesContract.create({
    data: {
      contractNo,
      exchangeRate,
      signedAt: data.signedAt ? new Date(data.signedAt) : null,
      note: data.note,
    },
  });

  return contract;
};

const updateSalesContract = async (id, data = {}) => {
  return prisma.salesContract.update({
    where: { id },
    data: {
      exchangeRate: parseNullableNumber(data.exchangeRate, undefined),
      signedAt: data.signedAt ? new Date(data.signedAt) : undefined,
      estimatedArrival: data.estimatedArrival ? new Date(data.estimatedArrival) : undefined,
      portId: data.portId || undefined,
      note: data.note,
    },
  });
};

const removeSalesContract = async (id) => {
  await prisma.salesContract.delete({ where: { id } });
};

const addSalesItem = async (id, data = {}) => {
  const contract = await prisma.salesContract.findUnique({ where: { id } });

  const item = await prisma.salesItem.create({
    data: {
      salesContractId: id,
      productId: data.productId,
      storeId: data.storeId,
      quantity: data.quantity,
      unit: data.unit,
      costPrice: data.costPrice,
      sellingPrice: data.sellingPrice || (data.costPrice / contract.exchangeRate * 1.3),
      specification: data.specification,
      note: data.note,
    },
    include: { product: true, store: true },
  });

  await inventorySnapshot.reconcileSalesFinancials(prisma, id);

  return item;
};

const updateSalesStatus = async (id, status, context = {}) => {
  const targetStatus = normalizeFilterStatus(typeof status === 'string' ? status.trim() : status);

  if (!targetStatus) {
    throw createError('status 不能为空', 400);
  }

  let revertResult = null;
  let applyResult = null;

  const contract = await prisma.$transaction(async (tx) => {
    const existingContract = await tx.salesContract.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!existingContract) {
      throw createError('出口合同不存在', 404);
    }

    const validationResult = validateSalesTransition(existingContract.status, targetStatus);
    if (!validationResult.valid) {
      throw createError(validationResult.message || '非法销售合同状态流转', 400);
    }

    const isTransition = existingContract.status !== targetStatus;
    const contract = await tx.salesContract.update({
      where: { id },
      data: { status: targetStatus },
    });

    // 正向流转：出库时扣减库存
    if (isTransition && targetStatus === SALES_STATUS.OUT_STOCK) {
      applyResult = await inventorySnapshot.applySalesOutStock(tx, id);
    }

    // 反向流转：从出库状态回退时，恢复库存
    if (isTransition && existingContract.status === SALES_STATUS.OUT_STOCK) {
      revertResult = await inventorySnapshot.revertSalesOutStock(tx, id);
    }

    return contract;
  });

  // 记录回滚操作的日志
  if (revertResult && revertResult.reverted > 0) {
    console.log(`[库存回滚] 销售合同 ${id}: 恢复 ${revertResult.reverted} 条出库记录`);
    // 将回滚信息附加到返回结果中，供控制器层记录审计日志
    contract._revertInfo = {
      action: 'REVERT_OUT_STOCK',
      revertedCount: revertResult.reverted,
      note: `销售出库回滚：恢复 ${revertResult.reverted} 条库存记录`,
    };
  }

  // 记录出库操作的日志
  if (applyResult && applyResult.results) {
    const totalAllocated = applyResult.results.reduce((sum, r) => sum + (r.allocatedQuantity || 0), 0);
    console.log(`[库存出库] 销售合同 ${id}: 出库 ${totalAllocated} 件商品`);
    contract._applyInfo = {
      action: 'APPLY_OUT_STOCK',
      allocatedQuantity: totalAllocated,
      note: `销售出库：出库 ${totalAllocated} 件商品`,
    };
  }

  return contract;
};

const getNextContractNo = async () => {
  const year = getCurrentYear();
  return generateNextContractNo({ prisma, year });
};

const calculateSellingPrice = ({ costPrice, exchangeRate, profitRate = 1.3 }) => {
  const numericCostPrice = Number(costPrice);
  const numericExchangeRate = Number(exchangeRate);
  const numericProfitRate = Number(profitRate);

  if (!Number.isFinite(numericCostPrice) || !Number.isFinite(numericExchangeRate) || !Number.isFinite(numericProfitRate)) {
    throw createError('costPrice、exchangeRate 和 profitRate 必须为数字', 400);
  }
  if (numericExchangeRate <= 0) {
    throw createError('exchangeRate 必须大于0', 400);
  }

  const sellingPrice = numericCostPrice / numericExchangeRate * numericProfitRate;

  return {
    exact: sellingPrice.toFixed(2),
    roundedUp: Math.ceil(sellingPrice),
    roundedDown: Math.floor(sellingPrice),
    recommended: Math.round(sellingPrice),
  };
};

const addPackingItem = async (id, data = {}) => {
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
      length: data.length || null,
      width: data.width || null,
      height: data.height || null,
      note: data.note,
    },
    include: { product: true, store: true },
  });

  await recalculateContractStats(id);

  return item;
};

const updatePackingItem = async (id, itemId, data = {}) => {
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
      length: data.length || null,
      width: data.width || null,
      height: data.height || null,
      note: data.note,
    },
    include: { product: true, store: true },
  });

  await recalculateContractStats(id);
  return item;
};

const removePackingItem = async (id, itemId) => {
  await prisma.packingItem.delete({ where: { id: itemId } });
  await recalculateContractStats(id);
};

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
      totalAmount: stats._sum.totalPrice || 0,
    },
  });
};

module.exports = {
  getSalesContracts,
  getSalesContractById,
  createSalesContract,
  updateSalesContract,
  removeSalesContract,
  addSalesItem,
  updateSalesStatus,
  getNextContractNo,
  calculateSellingPrice,
  addPackingItem,
  updatePackingItem,
  removePackingItem,
};
