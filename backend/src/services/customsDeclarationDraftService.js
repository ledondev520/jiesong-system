/**
 * Input: sales contracts, packing items, live HSCode declarations
 * Output: 按出口合同唯一生成的报关草稿，原子更新草稿且保留正式记录
 * Pos: 报关单草稿自动生成服务
 */

const prisma = require('../utils/prisma');
const { createError } = require('../middleware/errorHandler');

const buildDeclarationNo = (now, contractNo) => {
  const datePart = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
  ].join('');

  return `CUS-AUTO-${datePart}-${contractNo}`;
};

const buildWhere = ({ salesContractId } = {}) => {
  const where = {};
  if (salesContractId) {
    where.id = salesContractId;
  }
  return where;
};

const sumNumber = (items, pick) => items.reduce((total, item) => total + (pick(item) || 0), 0);

const resolveDeclarationElements = async (product) => {
  if (product?.declaration) {
    return product.declaration;
  }
  if (!product?.hsCode) {
    return '';
  }

  const record = await prisma.hsCode.findFirst({
    where: { hsCode: product.hsCode },
    orderBy: { effectiveDate: 'desc' },
  });

  return record?.declarationElements || '';
};

const buildItems = async (packingItems) => {
  const items = [];

  for (const packingItem of packingItems) {
    const declarationElements = packingItem.declarationElements
      || await resolveDeclarationElements(packingItem.product);
    items.push({
      productId: packingItem.productId,
      packingItemId: packingItem.id,
      customsName: packingItem.product?.customsName || '未命名商品',
      hsCode: packingItem.hsCode || packingItem.product?.hsCode || null,
      declarationElements: declarationElements || null,
      quantity: packingItem.quantity || 0,
      unit: packingItem.unit || packingItem.product?.unit || null,
      unitPrice: packingItem.unitPrice || null,
      totalPrice: packingItem.totalPrice || null,
    });
  }

  return items;
};

const buildDraftPayload = async (salesContract, now) => {
  const items = await buildItems(salesContract.packingItems || []);

  return {
    declarationNo: buildDeclarationNo(now, salesContract.contractNo),
    salesContractId: salesContract.id,
    declaredAt: now,
    exportDate: null,
    customsBroker: salesContract.customsBroker || null,
    currency: 'USD',
    exchangeRate: salesContract.exchangeRate || null,
    totalAmount: sumNumber(salesContract.packingItems || [], (item) => item.totalPrice),
    totalQuantity: sumNumber(salesContract.packingItems || [], (item) => item.quantity),
    totalNetWeight: sumNumber(salesContract.packingItems || [], (item) => item.netWeight),
    totalGrossWeight: sumNumber(salesContract.packingItems || [], (item) => item.grossWeight),
    status: 'DRAFT',
    note: `自动生成草稿，来源销售合同 ${salesContract.contractNo}`,
    items: {
      create: items,
    },
  };
};

const generateCustomsDeclarationDrafts = async (filters = {}) => {
  const salesContracts = await prisma.salesContract.findMany({
    where: buildWhere(filters),
    include: {
      packingItems: {
        include: {
          product: true,
        },
      },
    },
    orderBy: [
      { createdAt: 'asc' },
      { contractNo: 'asc' },
    ],
  });

  const now = new Date();
  let created = 0;
  let skipped = 0;
  const items = [];

  for (const salesContract of salesContracts) {
    const existing = await prisma.customsDeclaration.findFirst({
      where: { salesContractId: salesContract.id },
      orderBy: { createdAt: 'desc' },
    });

    if (existing && !filters.replaceExisting) {
      skipped += 1;
      items.push({
        salesContractId: salesContract.id,
        customsDeclarationId: existing.id,
        reason: 'existing_declaration',
      });
      continue;
    }

    if (existing && filters.replaceExisting && existing.status !== 'DRAFT') throw createError('正式报关记录不可由自动草稿替换，请按实际报关记录处理', 409);

    if (!salesContract.packingItems?.length) {
      skipped += 1;
      items.push({
        salesContractId: salesContract.id,
        customsDeclarationId: null,
        reason: 'no_packing_items',
      });
      continue;
    }

    const data = await buildDraftPayload(salesContract, now);
    // 嵌套更新是一笔事务，保留原ID/编号；状态条件避免生成期间被放行的记录遭覆盖。
    const record = existing ? await prisma.customsDeclaration.update({
      where: { id: existing.id, status: 'DRAFT' },
      data: { ...data, declarationNo: existing.declarationNo, items: { deleteMany: {}, create: data.items.create } },
    }) : await prisma.customsDeclaration.create({ data });

    created += 1;
    items.push({
      salesContractId: salesContract.id,
      customsDeclarationId: record.id,
      reason: null,
    });
  }

  return {
    created,
    skipped,
    items,
  };
};

module.exports = {
  generateCustomsDeclarationDrafts,
};
