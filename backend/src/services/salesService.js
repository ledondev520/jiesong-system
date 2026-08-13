const prisma = require('../utils/prisma');
const { createError } = require('../middleware/errorHandler');
const {
  generateNextContractNo,
  normalizeFilterStatus,
  parseNullableNumber,
} = require('./shared/contractUtils');
const {
  SALES_STATUS,
  normalizeSalesStatus,
  validateSalesTransition,
} = require('./salesStateMachine');
const inventorySnapshot = require('./inventorySnapshot');
const { evaluateShipmentReadiness } = require('./shipmentReadinessService');
const { evaluatePurchaseProductionReadiness } = require('./purchaseProductionService');

const READY_PURCHASE_STATUSES = Object.freeze([
  'READY',
  'SHIPPED',
  'RECEIVED',
  'COMPLETED',
  'PENDING_SHIPMENT',
  'OUT_STOCK',
  'IN_STOCK',
  'PAID',
  'DELIVERED',
]);

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
  const targetStatus = normalizeSalesStatus(status);

  if (!targetStatus) {
    throw createError('status 不能为空', 400);
  }

  let revertResult = null;
  let applyResult = null;

  const contract = await prisma.$transaction(async (tx) => {
    const existingContract = await tx.salesContract.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        grossWeight: true,
        volume: true,
        packingItems: {
          select: {
            id: true,
            boxes: true,
            quantity: true,
            volume: true,
            length: true,
            width: true,
            height: true,
            product: {
              select: {
                customsName: true,
                length: true,
                width: true,
                height: true,
                volume: true,
              },
            },
          },
        },
      },
    });

    if (!existingContract) {
      throw createError('出口合同不存在', 404);
    }

    const validationResult = validateSalesTransition(existingContract.status, targetStatus);
    if (!validationResult.valid) {
      throw createError(validationResult.message || '非法销售合同状态流转', 400);
    }

    const isTransition = existingContract.status !== targetStatus;
    if (isTransition && targetStatus === SALES_STATUS.SHIPPED) {
      const readiness = evaluateShipmentReadiness(existingContract);
      if (!readiness.ready) {
        let message = '当前货柜不满足发运条件';
        if (readiness.unplacedBoxCount > 0) {
          message = `仍有 ${readiness.unplacedBoxCount} 箱无法装入 40HQ 货柜`;
        } else if (readiness.overloaded) {
          message = `货柜${readiness.overloadReasons.includes('weight') ? '毛重超过22吨' : '体积超过68立方米'}`;
        } else if (readiness.missingBoxItemCount > 0 || existingContract.packingItems.length === 0) {
          message = '装箱明细或箱数未填写完整';
        } else if (!readiness.utilizationReady) {
          message = '毛重和体积均未达到80%出柜标准';
        }
        throw createError(message, 400);
      }
    }
    const contract = await tx.salesContract.update({
      where: { id },
      data: {
        status: targetStatus,
        ...(isTransition && targetStatus === SALES_STATUS.SHIPPED ? { shippedAt: new Date() } : {}),
      },
    });

    // 正向流转：出库时扣减库存
    if (isTransition && targetStatus === SALES_STATUS.SHIPPED) {
      applyResult = await inventorySnapshot.applySalesOutStock(tx, id);
    }

    // 反向流转：从出库状态回退时，恢复库存
    if (isTransition && normalizeSalesStatus(existingContract.status) === SALES_STATUS.SHIPPED) {
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
      specification: data.specification || null,
      supplement: data.supplement || null,
      hsCode: data.hsCode || null,
      declarationElements: data.declarationElements || null,
      origin: data.origin || null,
      manufacturer: data.manufacturer || null,
      invoiceNo: data.invoiceNo || null,
      purchaseContractNo: data.purchaseContractNo || null,
      purchaseCost: data.purchaseCost === undefined ? null : data.purchaseCost,
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

const SOURCE_LOCKED_PACKING_FIELDS = Object.freeze([
  'quantity',
  'boxes',
  'grossWeight',
  'netWeight',
  'volume',
  'length',
  'width',
  'height',
]);

const SOURCE_LOCKED_PACKING_LABELS = Object.freeze({
  quantity: '数量',
  boxes: '箱数',
  grossWeight: '毛重',
  netWeight: '净重',
  volume: '体积',
  length: '长度',
  width: '宽度',
  height: '高度',
});

const hasOwn = (value, field) => Object.prototype.hasOwnProperty.call(value, field);

const samePackingNumber = (current, next) => {
  const currentNumber = current === null || current === undefined || current === '' ? 0 : Number(current);
  const nextNumber = next === null || next === undefined || next === '' ? 0 : Number(next);
  return Number.isFinite(currentNumber)
    && Number.isFinite(nextNumber)
    && Math.abs(currentNumber - nextNumber) <= 0.000001;
};

const updatePackingItem = async (id, itemId, data = {}) => {
  const existing = await prisma.packingItem.findFirst({
    where: { id: itemId, salesContractId: id },
    select: {
      id: true,
      purchaseItemId: true,
      quantity: true,
      boxes: true,
      grossWeight: true,
      netWeight: true,
      volume: true,
      unitPrice: true,
      length: true,
      width: true,
      height: true,
    },
  });
  if (!existing) throw createError('装箱明细不存在', 404);

  if (existing.purchaseItemId) {
    const changedField = SOURCE_LOCKED_PACKING_FIELDS.find((field) => (
      hasOwn(data, field) && !samePackingNumber(existing[field], data[field])
    ));
    if (changedField) {
      throw createError(
        `该装箱明细来源于采购，${SOURCE_LOCKED_PACKING_LABELS[changedField]}由导入比例锁定；若需调整，请删除后重新按箱数导入`,
        400,
      );
    }
  }

  const unitPrice = data.unitPrice === undefined ? existing.unitPrice : (data.unitPrice || null);
  const quantity = data.quantity === undefined ? existing.quantity : data.quantity;
  const totalPrice = unitPrice && quantity ? unitPrice * quantity : null;

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
      specification: data.specification,
      supplement: data.supplement,
      hsCode: data.hsCode,
      declarationElements: data.declarationElements,
      origin: data.origin,
      manufacturer: data.manufacturer,
      invoiceNo: data.invoiceNo,
      purchaseContractNo: data.purchaseContractNo,
      purchaseCost: data.purchaseCost,
      length: data.length === undefined ? undefined : (data.length || null),
      width: data.width === undefined ? undefined : (data.width || null),
      height: data.height === undefined ? undefined : (data.height || null),
      note: data.note,
    },
    include: { product: true, store: true },
  });

  await recalculateContractStats(id);
  return item;
};

const removePackingItem = async (id, itemId) => {
  const existing = await prisma.packingItem.findFirst({
    where: { id: itemId, salesContractId: id },
    select: { id: true },
  });
  if (!existing) throw createError('装箱明细不存在', 404);

  await prisma.packingItem.delete({ where: { id: itemId } });
  await recalculateContractStats(id);
};

const recalculateContractStats = async (contractId, prismaClient = prisma) => {
  const stats = await prismaClient.packingItem.aggregate({
    where: { salesContractId: contractId },
    _sum: { boxes: true, grossWeight: true, netWeight: true, volume: true, totalPrice: true },
  });

  await prismaClient.salesContract.update({
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

const roundAllocation = (value, digits = 6) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
};

const getAllocatedTotals = (packingItems = []) => packingItems.reduce((sum, item) => ({
  boxes: sum.boxes + (Number(item.boxes) || 0),
  quantity: sum.quantity + (Number(item.quantity) || 0),
  grossWeight: sum.grossWeight + (Number(item.grossWeight) || 0),
  netWeight: sum.netWeight + (Number(item.netWeight) || 0),
  volume: sum.volume + (Number(item.volume) || 0),
}), { boxes: 0, quantity: 0, grossWeight: 0, netWeight: 0, volume: 0 });

const buildAvailablePurchaseItem = (source) => {
  const allocated = getAllocatedTotals(source.packingItems);
  const remaining = {
    boxes: Math.max((Number(source.boxes) || 0) - allocated.boxes, 0),
    quantity: roundAllocation(Math.max((Number(source.quantity) || 0) - allocated.quantity, 0)),
    grossWeight: roundAllocation(Math.max((Number(source.grossWeight) || 0) - allocated.grossWeight, 0)),
    netWeight: roundAllocation(Math.max((Number(source.netWeight) || 0) - allocated.netWeight, 0)),
    volume: roundAllocation(Math.max((Number(source.volume) || 0) - allocated.volume, 0)),
  };
  return {
    id: source.id,
    productId: source.productId,
    quantity: source.quantity,
    unit: source.unit,
    specification: source.specification,
    boxes: source.boxes,
    grossWeight: source.grossWeight,
    netWeight: source.netWeight,
    volume: source.volume,
    length: source.length,
    width: source.width,
    height: source.height,
    product: source.product,
    purchaseContract: {
      id: source.purchaseContract.id,
      contractNo: source.purchaseContract.contractNo,
      supplier: source.purchaseContract.supplier,
    },
    allocated,
    remaining,
  };
};

/**
 * 职责：列出已经确认完工、生产资料完整且仍有剩余箱数的采购明细。
 */
const getAvailablePurchaseItems = async (salesContractId) => {
  const contract = await prisma.salesContract.findUnique({
    where: { id: salesContractId },
    select: { id: true },
  });
  if (!contract) throw createError('出口合同不存在', 404);

  const sources = await prisma.purchaseItem.findMany({
    where: { purchaseContract: { status: { in: READY_PURCHASE_STATUSES } } },
    select: {
      id: true,
      productId: true,
      quantity: true,
      unit: true,
      specification: true,
      boxes: true,
      grossWeight: true,
      netWeight: true,
      volume: true,
      length: true,
      width: true,
      height: true,
      product: { select: { id: true, customsName: true } },
      purchaseContract: {
        select: {
          id: true,
          contractNo: true,
          status: true,
          productionCompletedAt: true,
          supplier: { select: { id: true, name: true } },
        },
      },
      packingItems: {
        select: {
          salesContractId: true,
          boxes: true,
          quantity: true,
          grossWeight: true,
          netWeight: true,
          volume: true,
        },
      },
    },
    orderBy: [
      { purchaseContract: { productionCompletedAt: 'asc' } },
      { createdAt: 'asc' },
    ],
  });

  return sources
    .filter((source) => evaluatePurchaseProductionReadiness([source]).ready)
    .map(buildAvailablePurchaseItem)
    .filter((source) => source.remaining.boxes > 0);
};

/**
 * 职责：按选中箱数把采购完工资料同比例导入货柜，保留采购明细来源以支持拆柜和剩余量追踪。
 */
const importPurchasePackingItems = async (salesContractId, selections = []) => {
  if (!Array.isArray(selections) || selections.length === 0) {
    throw createError('至少选择一条已完工采购明细', 400);
  }
  const normalized = selections.map((selection) => ({
    purchaseItemId: String(selection?.purchaseItemId || '').trim(),
    boxes: Number(selection?.boxes),
  }));
  if (normalized.some((selection) => !selection.purchaseItemId)) {
    throw createError('采购明细ID不能为空', 400);
  }
  if (normalized.some((selection) => !Number.isInteger(selection.boxes) || selection.boxes <= 0)) {
    throw createError('导入箱数必须为正整数', 400);
  }
  if (new Set(normalized.map((selection) => selection.purchaseItemId)).size !== normalized.length) {
    throw createError('不能重复选择同一采购明细', 400);
  }

  return prisma.$transaction(async (tx) => {
    const salesContract = await tx.salesContract.findUnique({
      where: { id: salesContractId },
      select: { id: true },
    });
    if (!salesContract) throw createError('出口合同不存在', 404);

    const sources = await tx.purchaseItem.findMany({
      where: {
        id: { in: normalized.map((selection) => selection.purchaseItemId) },
        purchaseContract: { status: { in: READY_PURCHASE_STATUSES } },
      },
      include: {
        product: { select: { id: true, customsName: true } },
        purchaseContract: {
          select: {
            id: true,
            contractNo: true,
            status: true,
            supplier: { select: { id: true, name: true } },
          },
        },
        packingItems: {
          select: {
            boxes: true,
            quantity: true,
            grossWeight: true,
            netWeight: true,
            volume: true,
          },
        },
      },
    });
    const sourceById = new Map(sources.map((source) => [source.id, source]));
    const createdItems = [];

    for (const selection of normalized) {
      const source = sourceById.get(selection.purchaseItemId);
      if (!source) throw createError(`采购明细 ${selection.purchaseItemId} 不存在或尚未确认完工`, 400);
      if (!evaluatePurchaseProductionReadiness([source]).ready) {
        throw createError(`采购明细 ${selection.purchaseItemId} 的生产资料不完整`, 400);
      }

      const available = buildAvailablePurchaseItem(source);
      if (selection.boxes > available.remaining.boxes) {
        throw createError(`采购明细 ${selection.purchaseItemId} 最多可导入 ${available.remaining.boxes} 箱`, 400);
      }
      const ratio = selection.boxes / Number(source.boxes);
      const purchaseContractNo = source.purchaseContract.contractNo;
      const item = await tx.packingItem.create({
        data: {
          salesContractId,
          purchaseItemId: source.id,
          productId: source.productId,
          quantity: roundAllocation(Number(source.quantity) * ratio),
          unit: source.unit,
          boxes: selection.boxes,
          grossWeight: roundAllocation(Number(source.grossWeight) * ratio),
          netWeight: roundAllocation(Number(source.netWeight) * ratio),
          volume: roundAllocation(Number(source.volume) * ratio),
          unitPrice: null,
          totalPrice: null,
          specification: source.specification,
          manufacturer: source.purchaseContract.supplier?.name || null,
          purchaseContractNo,
          purchaseCost: roundAllocation(Number(source.totalPrice) * ratio, 2),
          length: source.length,
          width: source.width,
          height: source.height,
          isOwnedByJiesong: true,
          note: `从采购合同 ${purchaseContractNo} 完工资料导入`,
        },
        include: { product: true, store: true },
      });
      createdItems.push(item);
    }

    await recalculateContractStats(salesContractId, tx);
    return { importedCount: createdItems.length, items: createdItems };
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
  getAvailablePurchaseItems,
  importPurchasePackingItems,
};
