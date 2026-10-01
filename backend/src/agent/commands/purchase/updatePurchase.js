/**
 * Input: 采购更正信息及事务客户端
 * Output: 原子重算后的草稿或既有合同头信息
 * Pos: HTTP / CLI / MCP 共用的采购更正命令
 */
const prisma = require('../../../utils/prisma');
const { createError } = require('../../../middleware/errorHandler');
const { normalizeItem } = require('./createPurchaseWithItems');
const { normalizePurchaseTaxRate } = require('../../../services/purchaseAmountService');

const updatePurchase = async ({ id, input = {}, prismaClient = prisma } = {}) => {
  return prismaClient.$transaction(async (tx) => {
    const contract = await tx.purchaseContract.findUnique({
      where: { id },
      include: { items: { include: { _count: { select: { inventories: true, packingItems: true } } } }, _count: { select: { payments: true, files: true } } },
    });
    if (!contract) throw createError('采购合同不存在', 404);
    const changingLines = input.items !== undefined || input.supplierId !== undefined || input.taxRate !== undefined;
    if (changingLines && (contract.status !== 'DRAFT' || contract.paidAmount > 0 || contract.invoiceNo
      || contract._count.payments > 0 || contract._count.files > 0
      || contract.items.some((item) => item._count.inventories > 0 || item._count.packingItems > 0))) {
      throw createError('仅未履行、未归档的草稿可更正供应商、税率和明细', 400);
    }
    if (input.supplierId !== undefined && !input.supplierId) throw createError('供应商不能为空', 400);
    if (input.items !== undefined && (!Array.isArray(input.items) || input.items.length === 0)) throw createError('至少提供一条采购明细', 400);
    const taxRate = normalizePurchaseTaxRate(input.taxRate ?? contract.taxRate);
    const items = changingLines ? (input.items ?? contract.items).map((item, index) => normalizeItem(item, index, taxRate)) : null;
    const dateValue = (value) => {
      if (!value) return null;
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) throw createError('日期格式无效', 400);
      return date;
    };
    return tx.purchaseContract.update({
      where: { id },
      data: {
        supplierId: input.supplierId,
        ...(items ? { taxRate, totalAmount: items.reduce((sum, item) => sum + item.totalPrice, 0), items: { deleteMany: {}, create: items } } : {}),
        signedAt: input.signedAt !== undefined ? dateValue(input.signedAt) : undefined,
        expectedDate: input.expectedDate !== undefined ? dateValue(input.expectedDate) : undefined,
        invoiceNo: input.invoiceNo,
        note: input.note,
      },
      include: { supplier: true, items: { include: { product: true } } },
    });
  });
};

module.exports = { updatePurchase };
