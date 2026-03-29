/**
 * Input: 采购合同头信息 + 明细列表
 * Output: 原子化创建后的完整采购合同
 * Pos: Agent 命令层采购录入能力，供 HTTP / CLI / MCP 复用
 */

const prisma = require('../../../utils/prisma');
const { createError } = require('../../../middleware/errorHandler');

const normalizeItem = (item, index) => {
  if (!item || typeof item !== 'object') {
    throw createError(`第 ${index + 1} 条采购明细格式非法`, 400);
  }

  const quantity = Number(item.quantity);
  const unitPrice = Number(item.unitPrice);
  if (!item.productId) {
    throw createError(`第 ${index + 1} 条采购明细缺少 productId`, 400);
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw createError(`第 ${index + 1} 条采购明细 quantity 必须大于 0`, 400);
  }
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    throw createError(`第 ${index + 1} 条采购明细 unitPrice 必须大于等于 0`, 400);
  }

  return {
    productId: item.productId,
    quantity,
    unitPrice,
    unit: item.unit || null,
    specification: item.specification || null,
    note: item.note || null,
    totalPrice: quantity * unitPrice,
  };
};

const createPurchaseWithItems = async ({ input, prismaClient = prisma } = {}) => {
  const data = input || {};
  if (!data.supplierId) {
    throw createError('supplierId 不能为空', 400);
  }
  if (!Array.isArray(data.items) || data.items.length === 0) {
    throw createError('至少提供一条采购明细', 400);
  }

  const normalizedItems = data.items.map(normalizeItem);
  const totalAmount = normalizedItems.reduce((sum, item) => sum + item.totalPrice, 0);

  return prismaClient.$transaction(async (tx) => {
    const year = new Date().getFullYear().toString().slice(-2);
    const contractNo = data.contractNo || (() => null)();
    const nextContractNo = contractNo || `CG${year}${String(
      (await tx.purchaseContract.count({
        where: { contractNo: { startsWith: `CG${year}` } },
      })) + 1,
    ).padStart(5, '0')}`;

    const contract = await tx.purchaseContract.create({
      data: {
        contractNo: nextContractNo,
        supplierId: data.supplierId,
        taxRate: data.taxRate || 13,
        signedAt: data.signedAt ? new Date(data.signedAt) : null,
        expectedDate: data.expectedDate ? new Date(data.expectedDate) : null,
        note: data.note || null,
        totalAmount,
      },
    });

    await tx.purchaseItem.createMany({
      data: normalizedItems.map((item) => ({
        purchaseContractId: contract.id,
        ...item,
      })),
    });

    return tx.purchaseContract.findUnique({
      where: { id: contract.id },
      include: {
        supplier: true,
        items: {
          include: {
            product: true,
          },
        },
      },
    });
  });
};

module.exports = {
  createPurchaseWithItems,
};
