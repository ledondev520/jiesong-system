/**
 * Input: sales contracts, packing items, live HSCode declarations
 * Output: 自动生成的报关单草稿
 * Pos: 报关单草稿自动生成服务
 */

const prisma = require('../utils/prisma');

const buildDeclarationNo = (now, index) => {
  const datePart = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
  ].join('');

  return `CUS-AUTO-${datePart}-${String(index).padStart(3, '0')}`;
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
    const declarationElements = await resolveDeclarationElements(packingItem.product);
    items.push({
      productId: packingItem.productId,
      packingItemId: packingItem.id,
      customsName: packingItem.product?.customsName || '未命名商品',
      hsCode: packingItem.product?.hsCode || null,
      declarationElements: declarationElements || null,
      quantity: packingItem.quantity || 0,
      unit: packingItem.unit || packingItem.product?.unit || null,
      unitPrice: packingItem.unitPrice || null,
      totalPrice: packingItem.totalPrice || null,
    });
  }

  return items;
};

const buildDraftPayload = async (salesContract, now, index) => {
  const items = await buildItems(salesContract.packingItems || []);

  return {
    declarationNo: buildDeclarationNo(now, index),
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
  let sequence = 1;
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

    if (existing && filters.replaceExisting) {
      await prisma.customsDeclaration.delete({
        where: { id: existing.id },
      });
    }

    if (!salesContract.packingItems?.length) {
      skipped += 1;
      items.push({
        salesContractId: salesContract.id,
        customsDeclarationId: null,
        reason: 'no_packing_items',
      });
      continue;
    }

    const data = await buildDraftPayload(salesContract, now, sequence);
    const record = await prisma.customsDeclaration.create({ data });

    created += 1;
    sequence += 1;
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
