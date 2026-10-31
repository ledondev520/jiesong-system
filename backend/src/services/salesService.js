/** 出口合同与装箱服务；表头局部保存保留省略字段，历史发运重放不重复扣库，发运后货物与出库保持一致。 */
const prisma = require('../utils/prisma');
const { assertStoresOwnedBy } = require('./shared/storeOwnership');
const { parseShanghaiDateRange } = require('../utils/dateRange');
const { createError } = require('../middleware/errorHandler');
const { resolveOrderCustomerFields, resolveCustomerIdForNewStore } = require('./customerService');
const {
  generateNextContractNo,
  normalizeFilterStatus,
  parseNullableNumber,
} = require('./shared/contractUtils');
const {
  SALES_STATUS,
  normalizeSalesStatus,
  getSalesSettlementStatus,
  validateSalesTransition,
} = require('./salesStateMachine');
const inventorySnapshot = require('./inventorySnapshot');
const { defaultSpotRate, orderMargin, orderRateInput, priceFor } = require('./exportPricing');
const { categoryIdsByProduct, withCategoryChains } = require('./productCategoryChain');
const { lastConfirmedPrices } = require('./lastConfirmedPrice');
const { checkUtilisation, evaluateShipmentReadiness } = require('./shipmentReadinessService');
const { getContainerSpec } = require('./containerSpecs');
const { evaluatePurchaseProductionReadiness } = require('./purchaseProductionService');
const { buildDerivedSalesAmountUpdate } = require('./salesContractAmount');
const { getSalesCargoState, assertSalesCargoMutable, assertSalesCargoUpdate } = require('./salesCargoLifecycle');

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

const getSalesContracts = async ({ page, pageSize, status, storeId, customerId, keyword, shipped = false, shippedFrom, shippedTo, lite = false }) => {
  const where = {};
  if (shipped !== false && shipped !== true && shipped !== 'false' && shipped !== 'true') throw createError('shipped 必须为true或false', 400);
  const shippedOnly = shipped === true || shipped === 'true';
  if (shippedOnly) where.status = { in: ['SHIPPED', 'ARRIVED', 'COMPLETED'] };
  if (status) {
    if (typeof status !== 'string') throw createError('status 必须为状态文本', 400);
    if (shippedOnly) where.AND = [{ status: normalizeFilterStatus(status) }];
    else where.status = normalizeFilterStatus(status);
  }
  const dateRange = parseShanghaiDateRange(shippedFrom, shippedTo);
  if (Object.keys(dateRange).length > 0) where.shippedAt = dateRange;
  if (storeId) {
    where.items = { some: { storeId } };
  }
  if (customerId !== undefined) {
    if (typeof customerId !== 'string' || !customerId.trim()) throw createError('customerId 必须为非空文本', 400);
    where.customerId = customerId.trim();
  }
  if (keyword) {
    if (typeof keyword !== 'string') throw createError('keyword 必须为文本', 400);
    const text = keyword.trim();
    if (text) where.OR = [
      { contractNo: { contains: text } },
      { port: { is: { name: { contains: text } } } },
      { packingItems: { some: { store: { is: { name: { contains: text } } } } } },
      { items: { some: { store: { is: { name: { contains: text } } } } } },
    ];
  }

  const skip = (page - 1) * pageSize;
  const [rawContracts, total] = await Promise.all([
    prisma.salesContract.findMany({
      where,
      skip,
      take: pageSize,
      include: {
        port: lite ? { select: { id: true, name: true } } : true,
        packingItems: {
          select: {
            isOwnedByJiesong: true,
            sourceParty: true,
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
      // 列表只做汇总利用率（合同头由装箱明细汇总而来）；能否装下仅在详情页排柜后得知。
      loadingUtilisation: checkUtilisation({ grossKg: c.grossWeight, cargoCbm: c.volume }, getContainerSpec()),
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
      quote: { select: { spotRate: true } },
      // 订单详情「采购」页签与「按门店」表；只读数量与状态，不含采购价格
      purchaseContracts: {
        select: {
          id: true,
          contractNo: true,
          status: true,
          supplier: { select: { id: true, name: true } },
          items: {
            select: {
              id: true,
              productId: true,
              storeId: true,
              quantity: true,
              receiptItems: { select: { acceptedQuantity: true } },
            },
          },
        },
        orderBy: { contractNo: 'asc' },
      },
    },
  });

  if (!contract) {
    throw createError('出口合同不存在', 404);
  }

  const sourceParties = getThirdPartySources(contract.packingItems || []);

  const { quote, ...rest } = contract;
  return {
    ...rest,
    // 汇率口径（评审 R1-1）：报价转换的订单 exchangeRate 存的是计价汇率，spotRate 给出现汇供页面预填。
    rateBasis: contract.quoteId ? 'effective' : 'spot',
    spotRate: contract.quoteId ? (quote?.spotRate ?? null) : contract.exchangeRate,
    hasThirdPartyCargo: sourceParties.length > 0,
    sourceParties,
  };
};

// 完整明细及带请求键的创建走原子服务；既有仅建表头的调用保持兼容。
const createSalesContract = async (data = {}, context = {}) => {
  if (data.items !== undefined || context.idempotencyKey) {
    return require('./salesCreationService').createSalesContractAtomically(data, context);
  }
  const year = getCurrentYear();
  const contractNo = data.contractNo || (await generateNextContractNo({ prisma, year }));
  const exchangeRate = parseNullableNumber(data.exchangeRate, defaultSpotRate());
  const customerFields = await resolveOrderCustomerFields(data);

  const contract = await prisma.salesContract.create({
    data: {
      contractNo,
      exchangeRate,
      ...customerFields,
      signedAt: data.signedAt ? new Date(data.signedAt) : null,
      note: data.note,
    },
  });

  return contract;
};

const updateSalesContract = async (id, data = {}) => {
  let exchangeRate;
  // Passing undefined as the parser fallback activates its default null; omitted
  // metadata must never clear this required field or invent a replacement rate.
  if (data.exchangeRate !== undefined) {
    exchangeRate = parseNullableNumber(data.exchangeRate);
    if (!['number', 'string'].includes(typeof data.exchangeRate) || exchangeRate === null || exchangeRate <= 0) {
      throw createError('汇率必须为正数', 400);
    }
  }
  const update = (db, customerId) => db.salesContract.update({
    where: { id },
    data: {
      exchangeRate,
      customerId,
      signedAt: data.signedAt ? new Date(data.signedAt) : undefined,
      estimatedArrival: data.estimatedArrival ? new Date(data.estimatedArrival) : undefined,
      portId: data.portId || undefined,
      note: data.note,
    },
  });
  if (data.customerId === undefined) return update(prisma);
  // customerId 只能在草稿阶段更换（DATA-MODEL §2.4）；设为当前值是无操作，清空不允许。
  return prisma.$transaction(async (tx) => {
    const current = await tx.salesContract.findUnique({ where: { id }, select: { status: true, customerId: true } });
    if (!current) throw createError('出口合同不存在', 404);
    if (data.customerId === null || data.customerId === '') throw createError('请选择客户', 400);
    let customerId;
    if (String(data.customerId) !== current.customerId) {
      if (current.status !== SALES_STATUS.DRAFT) throw createError('仅草稿订单可更换客户', 400);
      customerId = await resolveCustomerIdForNewStore(data.customerId, tx, '订单');
    }
    return update(tx, customerId);
  });
};

const removeSalesContract = async (id) => prisma.$transaction(async (tx) => {
  assertSalesCargoMutable(await getSalesCargoState(tx, id));
  await tx.salesContract.delete({ where: { id } });
});

// 未给售价时：老商品取上次确认价，否则按唯一报价规则（订单已保存的现汇）定价；缺成本/汇率时拒绝，不再用代码里的 ×1.3。
const ruleSellingPrice = async (contract, data) => {
  const last = (await lastConfirmedPrices(prisma, [data.productId], { excludeSalesContractId: contract?.id })).get(data.productId);
  if (last) return last.price;
  const product = await prisma.product.findUnique({ where: { id: data.productId }, select: { id: true, categoryId: true } });
  const [withChain] = await withCategoryChains([{ product }], prisma);
  const priced = priceFor({ costCny: data.costPrice, categoryIds: withChain?.product?.categoryIds || [], ...orderRateInput(contract) });
  if (priced.status !== 'OK') throw createError('缺少有效成本或汇率，无法按报价规则定价，请填写售价', 400);
  return priced.unitPriceUsd;
};

const addSalesItem = async (id, data = {}) => {
  const contract = await prisma.salesContract.findUnique({ where: { id } });
  if (contract) await assertStoresOwnedBy(prisma, [data.storeId], contract.customerId);
  const sellingPrice = data.sellingPrice || await ruleSellingPrice(contract, data);

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

  await inventorySnapshot.reconcileSalesFinancials(prisma, id);

  return item;
};

const updateSalesStatus = async (id, status, context = {}) => {
  const targetStatus = normalizeSalesStatus(status);

  if (!targetStatus) {
    throw createError('status 不能为空', 400);
  }

  let applyResult = null;

  const contract = await prisma.$transaction(async (tx) => {
    const existingContract = await tx.salesContract.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        totalAmount: true,
        receivedAmount: true,
        grossWeight: true,
        volume: true,
        packingItems: {
          select: {
            id: true,
            boxes: true,
            quantity: true,
            grossWeight: true,
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

    const isTransition = normalizeSalesStatus(existingContract.status) !== targetStatus;
    const settledStatus = getSalesSettlementStatus(targetStatus, existingContract.totalAmount, existingContract.receivedAmount);
    if (targetStatus === SALES_STATUS.COMPLETED && settledStatus !== SALES_STATUS.COMPLETED) {
      throw createError('销售款项尚未结清或存在金额差异，请先处理收款记录', 400);
    }
    const finalStatus = targetStatus === SALES_STATUS.CONFIRMED
      && existingContract.packingItems.some(item => Number(item.boxes) > 0) ? SALES_STATUS.PACKING : settledStatus;
    if (isTransition && targetStatus === SALES_STATUS.SHIPPED) {
      // 门槛固定按默认柜型（40HQ）；柜型是否落库待业主决定。
      const { check } = evaluateShipmentReadiness(existingContract);
      if (!check.ready) throw createError(check.headline, 400);
    }
    const contract = await tx.salesContract.update({
      where: { id },
      data: {
        status: finalStatus,
        ...(isTransition && targetStatus === SALES_STATUS.SHIPPED ? { shippedAt: new Date() } : {}),
      },
    });

    // 正向流转：出库时扣减库存
    if (isTransition && targetStatus === SALES_STATUS.SHIPPED) {
      applyResult = await inventorySnapshot.applySalesOutStock(tx, id);
    }

    return contract;
  });

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

// 推荐售价 = 唯一报价规则（加价、现汇 − 调整、向上取整到整美元见 exportPricing.roundUnitPrice）。profitRate 不再由调用方传入。
const calculateSellingPrice = ({ costPrice, exchangeRate, profitRate, categoryIds } = {}) => {
  if (profitRate !== undefined) throw createError('利润率由报价规则统一配置，不能在请求中指定', 400);
  const numericCostPrice = Number(costPrice);
  if (!Number.isFinite(numericCostPrice)) throw createError('costPrice 必须为数字', 400);
  if (exchangeRate !== undefined && !(Number(exchangeRate) > 0)) throw createError('exchangeRate 必须大于0', 400);

  const priced = priceFor({ costCny: numericCostPrice, categoryIds, spotRate: exchangeRate === undefined ? undefined : Number(exchangeRate) });
  if (priced.status !== 'OK') throw createError(priced.status === 'MISSING_COST' ? 'costPrice 必须大于0' : '现汇无效，无法报价', 400);
  return {
    exact: priced.rawUnitPriceUsd.toFixed(2),
    roundedUp: Math.ceil(priced.rawUnitPriceUsd),
    roundedDown: Math.floor(priced.rawUnitPriceUsd),
    recommended: priced.unitPriceUsd,
    effectiveRate: priced.effectiveRate,
    markup: priced.markup,
  };
};

/** 报价页按商品取分类链后再定价：瓷砖等分类加价与后端保存时一致；老商品的 recommended 取上次确认价（formulaRecommended 仍是规则价）。 */
const calculateProductSellingPrice = async ({ productId, ...input } = {}) => {
  const categoryIds = productId ? (await categoryIdsByProduct([productId], prisma)).get(productId) : undefined;
  const result = calculateSellingPrice({ ...input, categoryIds });
  const last = productId ? (await lastConfirmedPrices(prisma, [productId])).get(productId) : undefined;
  return { ...result, formulaRecommended: result.recommended, recommended: last?.price ?? result.recommended, source: last ? 'LAST_CONFIRMED' : 'RULE' };
};

/** 报价/建单预览的订单整体利润率（只提示，不阻止保存）；口径见 exportPricing.orderMargin。 */
const previewOrderMargin = async ({ exchangeRate, items } = {}) => {
  if (!Array.isArray(items) || items.length > 100) throw createError('items 必须为不超过100条的数组', 400);
  if (exchangeRate !== undefined && !(Number(exchangeRate) > 0)) throw createError('exchangeRate 必须大于0', 400);
  const chains = await categoryIdsByProduct(items.map((item) => item?.productId), prisma);
  return orderMargin({
    spotRate: exchangeRate === undefined ? undefined : Number(exchangeRate),
    lines: items.map((item) => ({
      costCny: item?.costPrice,
      quantity: item?.quantity,
      unitPriceUsd: item?.sellingPrice,
      categoryIds: chains.get(item?.productId) || [],
    })),
  });
};
const storeOwnerOf = async (tx, id) => (await tx.salesContract.findUnique({ where: { id }, select: { customerId: true } }))?.customerId;

const addPackingItem = async (id, data = {}) => prisma.$transaction(async (tx) => {
  assertSalesCargoMutable(await getSalesCargoState(tx, id));
  if (data.storeId) await assertStoresOwnedBy(tx, [data.storeId], await storeOwnerOf(tx, id));
  const unitPrice = data.unitPrice || null;
  const totalPrice = unitPrice && data.quantity ? unitPrice * data.quantity : null;

  const item = await tx.packingItem.create({
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

  await recalculateContractStats(id, tx);

  return item;
});

const updatePackingItem = async (id, itemId, data = {}) => prisma.$transaction(async (tx) => {
  const existing = await tx.packingItem.findFirst({
    where: { id: itemId, salesContractId: id },
    select: {
      id: true,
      purchaseItemId: true,
      quantity: true,
      unit: true,
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
  assertSalesCargoUpdate(await getSalesCargoState(tx, id), existing, data);
  if (data.storeId) await assertStoresOwnedBy(tx, [data.storeId], await storeOwnerOf(tx, id));

  const unitPrice = data.unitPrice === undefined ? existing.unitPrice : (data.unitPrice || null);
  const quantity = data.quantity === undefined ? existing.quantity : data.quantity;
  const totalPrice = unitPrice && quantity ? unitPrice * quantity : null;

  const item = await tx.packingItem.update({
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

  await recalculateContractStats(id, tx);
  return item;
});

const removePackingItem = async (id, itemId) => prisma.$transaction(async (tx) => {
  const existing = await tx.packingItem.findFirst({
    where: { id: itemId, salesContractId: id },
    select: { id: true },
  });
  if (!existing) throw createError('装箱明细不存在', 404);
  assertSalesCargoMutable(await getSalesCargoState(tx, id));

  await tx.packingItem.delete({ where: { id: itemId } });
  await recalculateContractStats(id, tx);
});

const recalculateContractStats = async (contractId, prismaClient = prisma) => {
  const [contract, stats] = await Promise.all([
    prismaClient.salesContract.findUnique({
      where: { id: contractId },
      select: { amountSource: true, status: true },
    }),
    prismaClient.packingItem.aggregate({
      where: { salesContractId: contractId },
      _sum: { boxes: true, grossWeight: true, netWeight: true, volume: true, totalPrice: true },
    }),
  ]);

  await prismaClient.salesContract.update({
    where: { id: contractId },
    data: {
      totalBoxes: stats._sum.boxes || 0,
      grossWeight: stats._sum.grossWeight || 0,
      netWeight: stats._sum.netWeight || 0,
      volume: stats._sum.volume || 0,
      ...buildDerivedSalesAmountUpdate(contract, stats._sum.totalPrice || 0),
      ...(normalizeSalesStatus(contract?.status) === SALES_STATUS.CONFIRMED && Number(stats._sum.boxes) > 0
        ? { status: SALES_STATUS.PACKING } : {}),
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
    assertSalesCargoMutable(await getSalesCargoState(tx, salesContractId));

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
          storeId: source.storeId, // 保留来源门店，供订单详情「按门店」已装箱统计
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
  getThirdPartySources,
  getSalesContracts,
  getSalesContractById,
  createSalesContract,
  updateSalesContract,
  removeSalesContract,
  addSalesItem,
  updateSalesStatus,
  getNextContractNo,
  calculateSellingPrice,
  calculateProductSellingPrice,
  previewOrderMargin,
  addPackingItem,
  updatePackingItem,
  removePackingItem,
  recalculateContractStats,
  getAvailablePurchaseItems,
  importPurchasePackingItems,
};
