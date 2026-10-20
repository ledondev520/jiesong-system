/**
 * Input: PrismaClient、库存/采购/销售模型
 * Output: 库存快照与库存出入库服务能力；自有货物无效数量拒绝登记发运
 * Pos: 统一处理库存快照、采购入库建档和销售出库扣减，确保财务金额对齐
 */

const { createError } = require('../middleware/errorHandler');
const prisma = require('../utils/prisma');
const { buildDerivedSalesAmountUpdate, isJiesongOwnedPackingItem } = require('./salesContractAmount');
const { INVENTORY_STATUS } = require('../config/constants');

const clampNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const toMoney = (value, precision = 2) => {
  const num = clampNumber(value, 0);
  return Number(num.toFixed(precision));
};

const getDefaultSnapshotInput = (tx = prisma) => tx;

/**
 * 获取库存快照（支持按商品筛选）。
 * 说明：用于前端展示与内部库存成本评估，返回按商品聚合后的可用库存和平均成本
 */
const getInventorySnapshot = async (tx = prisma, filters = {}) => {
  const where = {};
  if (filters.productId) {
    where.productId = filters.productId;
  }

  const inventories = await getDefaultSnapshotInput(tx).inventory.findMany({
    where,
    include: {
      purchaseItem: { select: { unitPrice: true } },
      product: { select: { id: true, customsName: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const byProductMap = new Map();

  inventories.forEach((item) => {
    const key = item.productId;
    const current = byProductMap.get(key) || {
      productId: item.productId,
      productName: item.product?.customsName || '未知商品',
      totalQuantity: 0,
      inboundQuantity: 0,
      outboundQuantity: 0,
      availableQuantity: 0,
      totalCost: 0,
      averageCost: 0,
      records: 0,
    };

    const quantity = clampNumber(item.quantity, 0);
    current.totalQuantity += quantity;
    current.records += 1;

    if (item.status === INVENTORY_STATUS.INBOUND) {
      current.inboundQuantity += quantity;
      current.availableQuantity += quantity;
      current.totalCost += quantity * clampNumber(item.purchaseItem?.unitPrice, 0);
    } else {
      current.outboundQuantity += quantity;
    }

    current.averageCost = current.inboundQuantity > 0
      ? toMoney(current.totalCost / current.inboundQuantity)
      : 0;

    byProductMap.set(key, current);
  });

  return {
    records: inventories,
    byProduct: Array.from(byProductMap.values()),
    totalQuantity: inventories.reduce((sum, item) => sum + clampNumber(item.quantity, 0), 0),
  };
};

/**
 * 重新计算采购合同财务金额（totalAmount）。
 */
const reconcilePurchaseFinancials = async (tx, purchaseContractId) => {
  const total = await getDefaultSnapshotInput(tx).purchaseItem.aggregate({
    where: { purchaseContractId },
    _sum: { totalPrice: true },
  });

  const totalAmount = toMoney(total._sum.totalPrice || 0, 2);

  await getDefaultSnapshotInput(tx).purchaseContract.update({
    where: { id: purchaseContractId },
    data: { totalAmount },
  });

  return totalAmount;
};

/**
 * 重新计算销售明细金额和成本；仅 DERIVED 合同同步 totalAmount。
 * 说明：FORMAL_DOCUMENT 金额来自正式合同，销售明细变化不得覆盖。
 */
const reconcileSalesFinancials = async (tx, salesContractId) => {
  const db = getDefaultSnapshotInput(tx);
  const [contract, items] = await Promise.all([
    db.salesContract.findUnique({
      where: { id: salesContractId },
      select: { amountSource: true, packingItems: { select: { totalPrice: true, purchaseCost: true, isOwnedByJiesong: true, note: true } } },
    }),
    db.salesItem.findMany({
      where: { salesContractId },
      select: {
        quantity: true,
        sellingPrice: true,
        costPrice: true,
      },
    }),
  ]);

  const packingItems = contract?.packingItems || [];
  const totalAmountRaw = packingItems.length ? packingItems.reduce((sum, item) => sum + clampNumber(item.totalPrice, 0), 0) : items.reduce(
    (sum, item) => sum + clampNumber(item.quantity, 0) * clampNumber(item.sellingPrice, 0),
    0,
  );
  const totalCostRaw = packingItems.length ? packingItems.filter(isJiesongOwnedPackingItem).reduce((sum, item) => sum + clampNumber(item.purchaseCost, 0), 0) : items.reduce(
    (sum, item) => sum + clampNumber(item.quantity, 0) * clampNumber(item.costPrice, 0),
    0,
  );

  const totalAmount = toMoney(totalAmountRaw, 2);
  const totalCost = toMoney(totalCostRaw, 2);
  const grossProfit = toMoney(totalAmountRaw - totalCostRaw, 2);

  await db.salesContract.update({
    where: { id: salesContractId },
    data: buildDerivedSalesAmountUpdate(contract, totalAmount),
  });

  return {
    totalAmount,
    totalCost,
    // 装箱收入为USD、采购成本为CNY，毛利交由 salesFinanceService 换汇计算。
    grossProfit: packingItems.length ? null : grossProfit,
  };
};

/** 兼容旧调用名：收货必须有全量合格证据，库存已在验货事务按增量建立，不能再次整单入库。 */
const applyPurchaseInStock = async (tx, purchaseContractId) => {
  const { assertPurchaseReceiptComplete } = require('./purchaseReceiptService');
  const summary = await assertPurchaseReceiptComplete(tx, purchaseContractId);
  return { created: 0, skipped: summary.items.length };
};

const allocateInboundInventory = async ({
  tx,
  productId,
  salesItemId,
  salesContractId,
  purchaseItemId,
  quantity,
  unit,
  at,
}) => {
  const target = clampNumber(quantity, 0);
  if (target <= 0) {
    return { allocatedQuantity: 0, averageCost: 0, allocations: [] };
  }
  const normalizedUnit = typeof unit === 'string' && unit.trim() ? unit.trim() : null;

  const availableInventories = await getDefaultSnapshotInput(tx).inventory.findMany({
    where: {
      productId,
      ...(purchaseItemId ? { purchaseItemId } : {}),
      ...(normalizedUnit ? { OR: [{ unit: normalizedUnit }, { unit: null }] } : {}),
      status: INVENTORY_STATUS.INBOUND,
      salesItemId: null,
    },
    orderBy: [
      { inboundAt: 'asc' },
      { createdAt: 'asc' },
    ],
    include: {
      purchaseItem: {
        select: { unitPrice: true },
      },
    },
  });

  const totalAvailable = availableInventories.reduce(
    (sum, item) => sum + clampNumber(item.quantity, 0),
    0,
  );

  if (totalAvailable + 1e-9 < target) {
    throw createError(`商品 ${productId} 库存不足，需出库 ${target}，可用 ${toMoney(totalAvailable, 3)}`, 400);
  }

  let remaining = target;
  let totalCost = 0;
  const allocations = [];

  for (const item of availableInventories) {
    if (remaining <= 0) {
      break;
    }

    const available = clampNumber(item.quantity, 0);
    if (available <= 0) {
      continue;
    }

    const outQty = Math.min(available, remaining);
    const unitCost = clampNumber(item.purchaseItem?.unitPrice, 0);
    const outboundUnit = item.unit || normalizedUnit || null;

    if (outQty >= available - 1e-9) {
      await getDefaultSnapshotInput(tx).inventory.update({
        where: { id: item.id },
        data: {
          salesItemId,
          salesContractId,
          status: INVENTORY_STATUS.OUTBOUND,
          outboundAt: at,
          unit: outboundUnit || undefined,
          note: '销售出库',
        },
      });
    } else {
      await getDefaultSnapshotInput(tx).inventory.update({
        where: { id: item.id },
        data: {
          quantity: available - outQty,
        },
      });

      await getDefaultSnapshotInput(tx).inventory.create({
        data: {
          productId,
          purchaseItemId: item.purchaseItemId,
          receiptInspectionId: item.receiptInspectionId,
          inboundAt: item.inboundAt,
          salesItemId,
          salesContractId,
          quantity: outQty,
          unit: outboundUnit,
          status: INVENTORY_STATUS.OUTBOUND,
          outboundAt: at,
          note: '销售出库',
        },
      });
    }

    remaining -= outQty;
    totalCost += outQty * unitCost;
    allocations.push({
      inventoryId: item.id,
      quantity: outQty,
      unitCost,
    });
  }

  const averageCost = target > 0 ? toMoney(totalCost / target, 2) : 0;

  return {
    allocatedQuantity: target,
    averageCost,
    allocations,
  };
};

/**
 * 自动出库并根据 FIFO 成本对齐销售明细 costPrice。
 */
const applySalesOutStock = async (tx, salesContractId) => {
  const contract = await getDefaultSnapshotInput(tx).salesContract.findUnique({
    where: { id: salesContractId },
    include: { items: true, packingItems: true },
  });

  if (!contract) {
    throw createError('销售合同不存在', 404);
  }

  const now = new Date();
  const results = [];

  // 装箱是当前出口的主来源；旧销售明细只在没有装箱行时兼容，不能双计。
  const packingItems = contract.packingItems || [];
  const shipmentItems = packingItems.length ? packingItems.filter(isJiesongOwnedPackingItem) : (contract.items || []);
  for (const item of shipmentItems) {
    // 草稿可以暂存未完成数量；实际发运不得静默跳过自有货物的无效出库量。
    const needed = Number(item.quantity);
    if (!Number.isFinite(needed) || needed <= 0) {
      throw createError('自有出库商品数量必须为正数，请先完善装箱或销售明细', 400);
    }

    const allocation = await allocateInboundInventory({
      tx,
      productId: item.productId,
      salesItemId: packingItems.length ? null : item.id,
      salesContractId,
      purchaseItemId: item.purchaseItemId,
      quantity: needed,
      unit: item.unit,
      at: now,
    });

    if (allocation.allocatedQuantity <= 0) {
      continue;
    }

    if (!packingItems.length) await getDefaultSnapshotInput(tx).salesItem.update({
      where: { id: item.id },
      data: { costPrice: allocation.averageCost },
    });

    results.push({
      salesItemId: packingItems.length ? null : item.id,
      ...(packingItems.length ? { packingItemId: item.id } : {}),
      productId: item.productId,
      ...allocation,
    });
  }

  await reconcileSalesFinancials(tx, salesContractId);

  return {
    results,
  };
};

/**
 * 回滚采购入库操作（当采购状态从 IN_STOCK 回退时）。
 * - 删除或恢复相关库存记录
 * - 保证幂等性
 */
const revertPurchaseInStock = async (tx, purchaseContractId) => {
  if (await tx.purchaseReceipt.count({ where: { purchaseContractId } }) > 0) {
    throw createError('已有分批验货记录的库存不可直接回滚', 400);
  }
  const contract = await getDefaultSnapshotInput(tx).purchaseContract.findUnique({
    where: { id: purchaseContractId },
    include: { items: true },
  });

  if (!contract) {
    throw createError('采购合同不存在', 404);
  }

  const purchaseItemIds = (contract.items || [])
    .map(item => item.id)
    .filter(id => !!id);

  if (purchaseItemIds.length === 0) {
    return { reverted: 0 };
  }

  // 查找并删除相关的库存记录
  const result = await getDefaultSnapshotInput(tx).inventory.deleteMany({
    where: {
      purchaseItemId: { in: purchaseItemIds },
      status: INVENTORY_STATUS.INBOUND,
    },
  });

  await reconcilePurchaseFinancials(tx, purchaseContractId);

  return { reverted: result.count };
};

/**
 * 回滚销售出库操作（当销售状态从 OUT_STOCK 回退时）。
 * - 恢复被占用的库存记录为可用状态
 * - 保证幂等性
 */
const revertSalesOutStock = async (tx, salesContractId) => {
  const contract = await getDefaultSnapshotInput(tx).salesContract.findUnique({
    where: { id: salesContractId },
    include: { items: true },
  });

  if (!contract) {
    throw createError('销售合同不存在', 404);
  }

  const salesItemIds = (contract.items || [])
    .map(item => item.id)
    .filter(id => !!id);

  // 查找相关的出库库存记录
  const outboundInventories = await getDefaultSnapshotInput(tx).inventory.findMany({
    where: {
      OR: [{ salesContractId }, ...(salesItemIds.length ? [{ salesItemId: { in: salesItemIds } }] : [])],
      status: INVENTORY_STATUS.OUTBOUND,
    },
    orderBy: { outboundAt: 'desc' },
  });

  if (outboundInventories.length === 0) {
    return { reverted: 0 };
  }

  // 恢复库存记录：将状态改回 INBOUND，清空销售关联
  const restorePromises = outboundInventories.map(inventory =>
    getDefaultSnapshotInput(tx).inventory.update({
      where: { id: inventory.id },
      data: {
        status: INVENTORY_STATUS.INBOUND,
        salesItemId: null,
        salesContractId: null,
        outboundAt: null,
        note: `库存回滚（原销售合同：${salesContractId}）`,
      },
    })
  );

  await Promise.all(restorePromises);
  await reconcileSalesFinancials(tx, salesContractId);

  return { reverted: outboundInventories.length };
};

module.exports = {
  getInventorySnapshot,
  applyPurchaseInStock,
  applySalesOutStock,
  revertPurchaseInStock,
  revertSalesOutStock,
  reconcilePurchaseFinancials,
  reconcileSalesFinancials,
};
