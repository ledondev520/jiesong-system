/**
 * Input: 采购合同、每批到货和累计验货结论、认证操作者
 * Output: 不可变到货/验货证据、仅合格增量库存、逐商品汇总与分页历史
 * Pos: 采购实物收货权威契约；SQLite Serializable 事务先条件写合同以串行化同单收货
 */
const { createHash } = require('node:crypto');
const prisma = require('../utils/prisma');
const { createError } = require('../middleware/errorHandler');
const { normalizePagination, buildPaginationMeta } = require('../utils/pagination');
const { normalizePurchaseStatus, getPurchaseSettlementStatus, PURCHASE_STATUS } = require('./purchaseStateMachine');
const { INVENTORY_STATUS } = require('../config/constants');

const EPSILON = 1e-9;
const quantity = (value, label, positive = false) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER || (positive && value <= 0)) {
    throw createError(`${label}必须为${positive ? '正' : '非负'}数值`, 400);
  }
  return value;
};
const text = (value, label, required = false, max = 1000) => {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) throw createError(`${label}无效或未填写`, 400);
  return value.trim();
};
const id = (value, label) => text(value, label, true, 128);
const normalizeItems = (items, normalize, key) => {
  if (!Array.isArray(items) || items.length === 0 || items.length > 100) throw createError('每次需提供1至100条明细', 400);
  const rows = items.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw createError(`第${index + 1}条明细格式无效`, 400);
    return normalize(item, index);
  });
  if (new Set(rows.map(row => row[key])).size !== rows.length) throw createError('包含重复明细', 400);
  return rows.sort((a, b) => a[key].localeCompare(b[key]));
};
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const actor = (user) => ({ id: user?.id, displayName: user?.name || '未知人员' });
const pending = (row) => Math.max(0, row.arrivedQuantity - row.acceptedQuantity - row.reinspectionQuantity);
const inspectionDto = (row) => ({
  id: row.id,
  receiptItemId: row.receiptItemId,
  acceptedQuantity: row.acceptedQuantity,
  acceptedIncrement: row.acceptedIncrement,
  reinspectionQuantity: row.reinspectionQuantity,
  pendingQuantity: row.pendingQuantity,
  note: row.note,
  inspectedAt: row.inspectedAt,
  inspectedBy: actor(row.inspectedBy),
});
const receiptInclude = {
  createdBy: { select: { id: true, name: true } },
  items: {
    orderBy: { id: 'asc' },
    include: {
      purchaseItem: { include: { product: { select: { customsName: true, unit: true } } } },
      _count: { select: { inspections: true } },
      inspections: { orderBy: [{ inspectedAt: 'desc' }, { id: 'desc' }], take: 20, include: { inspectedBy: { select: { id: true, name: true } } } },
    },
  },
};
const receiptDto = (row) => ({
  id: row.id,
  arrivedAt: row.arrivedAt,
  note: row.note,
  createdAt: row.createdAt,
  createdBy: actor(row.createdBy),
  items: row.items.map(item => ({
    id: item.id,
    purchaseItemId: item.purchaseItemId,
    productName: item.purchaseItem?.product?.customsName || '未知商品',
    unit: item.purchaseItem?.unit || item.purchaseItem?.product?.unit || '',
    arrivedQuantity: item.arrivedQuantity,
    acceptedQuantity: item.acceptedQuantity,
    pendingQuantity: pending(item),
    reinspectionQuantity: item.reinspectionQuantity,
    inspectionCount: item._count.inspections,
    inspections: item.inspections.map(inspectionDto),
  })),
});

const loadContract = async (tx, contractId) => {
  const contract = await tx.purchaseContract.findUnique({
    where: { id: contractId },
    include: { items: { include: { product: { select: { customsName: true, unit: true } } } }, _count: { select: { receipts: true } } },
  });
  if (!contract) throw createError('采购合同不存在', 404);
  return contract;
};

const getPurchaseReceiptSummary = async (tx, contractId, contract) => {
  contract ??= await loadContract(tx, contractId);
  const [groups, oldInventory] = await Promise.all([
    tx.purchaseReceiptItem.groupBy({
      by: ['purchaseItemId'],
      where: { receipt: { purchaseContractId: contractId } },
      _sum: { arrivedQuantity: true, acceptedQuantity: true, reinspectionQuantity: true },
    }),
    tx.inventory.findMany({ where: { purchaseItem: { purchaseContractId: contractId }, receiptInspectionId: null }, select: { purchaseItemId: true, quantity: true } }),
  ]);
  const grouped = new Map(groups.map(group => [group.purchaseItemId, group._sum]));
  const items = contract.items.map(item => {
    const sums = grouped.get(item.id) || {};
    const row = {
      purchaseItemId: item.id,
      productId: item.productId,
      productName: item.product?.customsName || '未知商品',
      unit: item.unit || item.product?.unit || '',
      orderedQuantity: item.quantity,
      arrivedQuantity: sums.arrivedQuantity || 0,
      acceptedQuantity: sums.acceptedQuantity || 0,
      reinspectionQuantity: sums.reinspectionQuantity || 0,
      legacyInventoryQuantity: oldInventory.filter(stock => stock.purchaseItemId === item.id).reduce((sum, stock) => sum + stock.quantity, 0),
    };
    return { ...row, pendingQuantity: pending(row), remainingQuantity: Math.max(0, item.quantity - row.arrivedQuantity) };
  });
  const status = normalizePurchaseStatus(contract.status);
  const legacy = oldInventory.length > 0 || (contract._count.receipts === 0 && [PURCHASE_STATUS.RECEIVED, PURCHASE_STATUS.COMPLETED].includes(status));
  const complete = !legacy && items.length > 0 && items.every(item => item.orderedQuantity > 0
    && Math.abs(item.arrivedQuantity - item.orderedQuantity) <= EPSILON
    && Math.abs(item.acceptedQuantity - item.orderedQuantity) <= EPSILON
    && item.pendingQuantity <= EPSILON && item.reinspectionQuantity <= EPSILON);
  // 不同单位不得靠总量相抵；完成判定始终逐采购明细。totals仅供结构摘要。
  const totals = items.reduce((sum, item) => {
    for (const key of ['orderedQuantity', 'arrivedQuantity', 'acceptedQuantity', 'pendingQuantity', 'reinspectionQuantity']) sum[key] += item[key];
    return sum;
  }, { orderedQuantity: 0, arrivedQuantity: 0, acceptedQuantity: 0, pendingQuantity: 0, reinspectionQuantity: 0 });
  return { legacy, complete, canReceive: !legacy && status === PURCHASE_STATUS.SHIPPED, totals, items };
};

const assertPurchaseReceiptComplete = async (tx, contractId) => {
  const summary = await getPurchaseReceiptSummary(tx, contractId);
  if (!summary.complete) throw createError('请先按批登记到货和验货，所有商品全量到齐且合格后才能确认收货', 400);
  return summary;
};

const transaction = async (db, run) => {
  // SQLite只有一个写者；条件写在数量汇总前取得写锁。冲突最多重试一次，原requestId继续去重。
  for (let attempt = 0; attempt < 2; attempt++) {
    try { return await db.$transaction(run, { isolationLevel: 'Serializable' }); }
    catch (error) {
      if (!['P2002', 'P2034'].includes(error?.code)) throw error;
      if (attempt === 1) throw createError('收货记录正在更新，请使用原请求重试', 409);
    }
  }
};
const lockForReceipt = async (tx, contractId) => {
  const result = await tx.purchaseContract.updateMany({ where: { id: contractId, status: PURCHASE_STATUS.SHIPPED }, data: { updatedAt: new Date() } });
  if (result.count !== 1) throw createError('仅已发货且未完成收货的合同可登记到货和验货', 400);
};
const assertNotLegacy = (summary) => {
  if (summary.legacy) throw createError('历史收货缺少分批验货来源，请核对历史记录，不能重复登记入库', 400);
};
const resultFor = async (tx, contractId, receiptId, idempotentReplay) => {
  const contract = await loadContract(tx, contractId);
  const row = await tx.purchaseReceipt.findFirst({ where: { id: receiptId, purchaseContractId: contractId }, include: receiptInclude });
  return { receipt: receiptDto(row), summary: await getPurchaseReceiptSummary(tx, contractId, contract), status: contract.status, idempotentReplay };
};

const createPurchaseReceipt = async (contractId, input, actorId, db = prisma) => {
  contractId = id(contractId, '采购合同ID');
  actorId = id(actorId, '操作者');
  input = input || {};
  const requestId = id(input.requestId, 'requestId');
  const arrivedAt = new Date(text(input.arrivedAt, '到货时间', true, 50));
  if (Number.isNaN(arrivedAt.getTime())) throw createError('到货时间无效', 400);
  const note = text(input.note, '到货备注') || null;
  const items = normalizeItems(input.items, (row, index) => ({ purchaseItemId: id(row.purchaseItemId, '采购明细ID'), arrivedQuantity: quantity(row.arrivedQuantity, `第${index + 1}条到货数量`, true) }), 'purchaseItemId');
  const requestHash = hash({ contractId, arrivedAt: arrivedAt.toISOString(), note, items });
  return transaction(db, async (tx) => {
    const existing = await tx.purchaseReceipt.findUnique({ where: { purchaseContractId_requestId: { purchaseContractId: contractId, requestId } } });
    if (existing) {
      if (existing.requestHash !== requestHash) throw createError('相同requestId不能用于不同到货内容', 409);
      return resultFor(tx, contractId, existing.id, true);
    }
    const contract = await loadContract(tx, contractId);
    await lockForReceipt(tx, contractId);
    const summary = await getPurchaseReceiptSummary(tx, contractId, contract);
    assertNotLegacy(summary);
    const knownItems = new Map(summary.items.map(item => [item.purchaseItemId, item]));
    for (const row of items) {
      const item = knownItems.get(row.purchaseItemId);
      if (!item) throw createError('到货明细不属于当前采购合同', 400);
      if (row.arrivedQuantity > item.remainingQuantity + EPSILON) throw createError('累计到货不能超过采购数量', 400);
    }
    const receipt = await tx.purchaseReceipt.create({ data: { purchaseContractId: contractId, requestId, requestHash, arrivedAt, note, createdById: actorId, items: { create: items } } });
    return resultFor(tx, contractId, receipt.id, false);
  });
};

const inspectPurchaseReceipt = async (contractId, receiptId, input, actorId, db = prisma) => {
  contractId = id(contractId, '采购合同ID');
  receiptId = id(receiptId, '到货批次ID');
  actorId = id(actorId, '操作者');
  input = input || {};
  const requestId = id(input.requestId, 'requestId');
  const note = text(input.note, '验货说明', true);
  const items = normalizeItems(input.items, (row, index) => ({ receiptItemId: id(row.receiptItemId, '到货明细ID'), acceptedQuantity: quantity(row.acceptedQuantity, `第${index + 1}条合格数量`), reinspectionQuantity: quantity(row.reinspectionQuantity, `第${index + 1}条待复验数量`) }), 'receiptItemId');
  const requestHash = hash({ contractId, receiptId, note, items });
  return transaction(db, async (tx) => {
    const receipt = await tx.purchaseReceipt.findFirst({ where: { id: receiptId, purchaseContractId: contractId }, include: receiptInclude });
    if (!receipt) throw createError('到货批次不存在或不属于当前合同', 404);
    const existing = await tx.purchaseReceiptInspection.findMany({ where: { receiptId, requestId } });
    if (existing.length > 0) {
      if (existing.some(row => row.requestHash !== requestHash) || existing.length !== items.length) throw createError('相同requestId不能用于不同验货内容', 409);
      return resultFor(tx, contractId, receiptId, true);
    }
    const contract = await loadContract(tx, contractId);
    await lockForReceipt(tx, contractId);
    assertNotLegacy(await getPurchaseReceiptSummary(tx, contractId, contract));
    const receiptItems = new Map(receipt.items.map(item => [item.id, item]));
    // 先验证整批；任何一行失败，证据、累计量和库存都不落部分结果。
    for (const row of items) {
      const item = receiptItems.get(row.receiptItemId);
      if (!item) throw createError('验货明细不属于当前到货批次', 400);
      if (row.acceptedQuantity < item.acceptedQuantity) throw createError('已合格入库数量不能下调', 400);
      if (row.acceptedQuantity + row.reinspectionQuantity > item.arrivedQuantity + EPSILON) throw createError('合格与待复验数量不能超过本批到货量', 400);
    }
    const inspectedAt = new Date();
    for (const row of items) {
      const item = receiptItems.get(row.receiptItemId);
      const acceptedIncrement = row.acceptedQuantity - item.acceptedQuantity;
      const updated = await tx.purchaseReceiptItem.updateMany({ where: { id: item.id, acceptedQuantity: item.acceptedQuantity, reinspectionQuantity: item.reinspectionQuantity }, data: { acceptedQuantity: row.acceptedQuantity, reinspectionQuantity: row.reinspectionQuantity } });
      if (updated.count !== 1) throw createError('该批次已被他人验货，请刷新后重试', 409);
      const inspection = await tx.purchaseReceiptInspection.create({ data: { receiptId, receiptItemId: item.id, requestId, requestHash, acceptedQuantity: row.acceptedQuantity, acceptedIncrement, reinspectionQuantity: row.reinspectionQuantity, pendingQuantity: Math.max(0, item.arrivedQuantity - row.acceptedQuantity - row.reinspectionQuantity), note, inspectedById: actorId, inspectedAt } });
      if (acceptedIncrement > 0) await tx.inventory.create({ data: { productId: item.purchaseItem.productId, purchaseItemId: item.purchaseItemId, receiptInspectionId: inspection.id, quantity: acceptedIncrement, unit: item.purchaseItem.unit || item.purchaseItem.product?.unit, status: INVENTORY_STATUS.INBOUND, inboundAt: inspectedAt, note: '采购验货合格入库' } });
    }
    const summary = await getPurchaseReceiptSummary(tx, contractId);
    if (summary.complete) await tx.purchaseContract.update({ where: { id: contractId }, data: { status: getPurchaseSettlementStatus(PURCHASE_STATUS.RECEIVED, contract.totalAmount, contract.paidAmount) } });
    return resultFor(tx, contractId, receiptId, false);
  });
};

const listPurchaseReceipts = async (contractId, query = {}, db = prisma) => transaction(db, async (tx) => {
  contractId = id(contractId, '采购合同ID');
  const contract = await loadContract(tx, contractId);
  const { page, pageSize, skip } = normalizePagination(query, { pageSize: 20, maxPageSize: 100 });
  const [rows, total, summary] = await Promise.all([
    tx.purchaseReceipt.findMany({ where: { purchaseContractId: contractId }, skip, take: pageSize, orderBy: [{ arrivedAt: 'desc' }, { id: 'desc' }], include: receiptInclude }),
    tx.purchaseReceipt.count({ where: { purchaseContractId: contractId } }),
    getPurchaseReceiptSummary(tx, contractId, contract),
  ]);
  return { items: rows.map(receiptDto), pagination: buildPaginationMeta(total, page, pageSize), summary, status: contract.status };
});

const listPurchaseReceiptInspections = async (contractId, receiptId, query = {}, db = prisma) => transaction(db, async (tx) => {
  contractId = id(contractId, '采购合同ID');
  receiptId = id(receiptId, '到货批次ID');
  const receipt = await tx.purchaseReceipt.findFirst({ where: { id: receiptId, purchaseContractId: contractId }, select: { id: true } });
  if (!receipt) throw createError('到货批次不存在或不属于当前合同', 404);
  const { page, pageSize, skip } = normalizePagination(query, { pageSize: 20, maxPageSize: 100 });
  const [rows, total] = await Promise.all([
    tx.purchaseReceiptInspection.findMany({ where: { receiptId }, skip, take: pageSize, orderBy: [{ inspectedAt: 'desc' }, { id: 'desc' }], include: { inspectedBy: { select: { id: true, name: true } }, receiptItem: { include: { purchaseItem: { include: { product: { select: { customsName: true, unit: true } } } } } } } }),
    tx.purchaseReceiptInspection.count({ where: { receiptId } }),
  ]);
  return { items: rows.map(row => ({ ...inspectionDto(row), purchaseItemId: row.receiptItem.purchaseItemId, productName: row.receiptItem.purchaseItem.product.customsName, unit: row.receiptItem.purchaseItem.unit || row.receiptItem.purchaseItem.product?.unit || '' })), pagination: buildPaginationMeta(total, page, pageSize) };
});

module.exports = { createPurchaseReceipt, inspectPurchaseReceipt, listPurchaseReceipts, listPurchaseReceiptInspections, getPurchaseReceiptSummary, assertPurchaseReceiptComplete };
