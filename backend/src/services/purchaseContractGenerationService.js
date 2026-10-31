/**
 * Input: 已确认出口订单、销售明细→供应商/不含税采购单价的选择
 * Output: 每个供应商一份 DRAFT 采购合同（同一事务；任何校验或写入失败整体回滚）
 * Pos: 「生成采购单」(DATA-MODEL-2026 §3.3)；草稿不是应付，签订及之后沿用既有采购流程
 * Note: 金额口径复用 agent/commands/purchase 的 normalizeItem（不含税单价 + 税率 → 含税行总额）。
 */
const prisma = require('../utils/prisma');
const { createError } = require('../middleware/errorHandler');
const { SALES_STATUS, PURCHASE_STATUS } = require('../config/constants');
const { generateNextPurchaseContractNo, isPurchaseNumberConflict } = require('./purchaseContractNumberService');
const { normalizeItem } = require('../agent/commands/purchase/createPurchaseWithItems');

const DEFAULT_TAX_RATE = 13;

const parseLines = (lines) => {
  if (!Array.isArray(lines) || lines.length === 0) throw createError('请选择要生成采购单的明细', 400);
  const seen = new Set();
  return lines.map((line, index) => {
    const salesItemId = typeof line?.salesItemId === 'string' ? line.salesItemId.trim() : '';
    const supplierId = typeof line?.supplierId === 'string' ? line.supplierId.trim() : '';
    const unitPrice = typeof line?.unitPrice === 'number' ? line.unitPrice : Number.NaN;
    if (!salesItemId || !supplierId) throw createError(`第 ${index + 1} 行缺少销售明细或供应商`, 400);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) throw createError(`第 ${index + 1} 行采购单价必须大于 0`, 400);
    if (seen.has(salesItemId)) throw createError('同一销售明细不能重复选择', 400);
    seen.add(salesItemId);
    return { salesItemId, supplierId, unitPrice };
  });
};

const generateInTransaction = async (tx, salesContractId, lines) => {
  const order = await tx.salesContract.findUnique({
    where: { id: salesContractId },
    include: { items: { select: { id: true, productId: true, storeId: true, quantity: true, unit: true, specification: true } } },
  });
  if (!order) throw createError('出口订单不存在', 404);
  if (String(order.status).toUpperCase() !== SALES_STATUS.CONFIRMED) throw createError('仅已确认的订单可以生成采购单', 400);

  const itemsById = new Map(order.items.map((item) => [item.id, item]));
  for (const line of lines) {
    if (!itemsById.has(line.salesItemId)) throw createError('销售明细不属于该订单', 400);
  }
  const supplierIds = [...new Set(lines.map((line) => line.supplierId))];
  const suppliers = await tx.supplier.findMany({ where: { id: { in: supplierIds } }, select: { id: true, isActive: true } });
  const activeSuppliers = new Set(suppliers.filter((supplier) => supplier.isActive).map((supplier) => supplier.id));
  if (supplierIds.some((id) => !activeSuppliers.has(id))) throw createError('供应商不存在或已归档', 400);

  // 同一订单已有未取消采购单含同一 (商品, 门店) 时整体拒绝；允许分批生成不同明细。
  const requested = lines.map((line) => itemsById.get(line.salesItemId));
  const existing = await tx.purchaseItem.findMany({
    where: {
      purchaseContract: { salesContractId, status: { not: PURCHASE_STATUS.CANCELLED } },
      OR: requested.map((item) => ({ productId: item.productId, storeId: item.storeId })),
    },
    select: { productId: true, storeId: true },
  });
  if (existing.length) {
    const pairs = [...new Set(existing.map((row) => `${row.productId}/${row.storeId}`))];
    throw createError(`以下商品/门店已生成过采购单：${pairs.join('、')}`, 409);
  }

  const bySupplier = new Map();
  for (const line of lines) {
    if (!bySupplier.has(line.supplierId)) bySupplier.set(line.supplierId, []);
    bySupplier.get(line.supplierId).push(line);
  }
  const created = [];
  for (const [supplierId, group] of bySupplier) {
    const items = group.map((line, index) => {
      const source = itemsById.get(line.salesItemId);
      return {
        ...normalizeItem({
          productId: source.productId, quantity: source.quantity, unitPrice: line.unitPrice,
          unit: source.unit, specification: source.specification,
        }, index, DEFAULT_TAX_RATE),
        storeId: source.storeId,
      };
    });
    const contract = await tx.purchaseContract.create({
      data: {
        contractNo: await generateNextPurchaseContractNo(tx),
        supplierId,
        taxRate: DEFAULT_TAX_RATE,
        status: PURCHASE_STATUS.DRAFT,
        salesContractId,
        totalAmount: items.reduce((sum, item) => sum + item.totalPrice, 0),
      },
    });
    await tx.purchaseItem.createMany({ data: items.map((item) => ({ purchaseContractId: contract.id, ...item })) });
    created.push({ id: contract.id, contractNo: contract.contractNo, supplierId, itemCount: items.length, totalAmount: contract.totalAmount });
  }
  return { contracts: created };
};

/** 事务整体回滚；编号竞争只重试可恢复的并发冲突，最多 3 次。 */
const generatePurchaseDrafts = async ({ salesContractId, lines, prismaClient = prisma }) => {
  const parsed = parseLines(lines);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prismaClient.$transaction((tx) => generateInTransaction(tx, salesContractId, parsed));
    } catch (error) {
      if (!(error?.code === 'P2034' || isPurchaseNumberConflict(error))) throw error;
      if (attempt === 2) throw createError('采购编号正在分配，请稍后重试', 409);
    }
  }
};

module.exports = { generatePurchaseDrafts, parseLines };
