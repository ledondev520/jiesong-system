/**
 * Input: customs declarations, live HSCode rates, forex verification
 * Output: 自动生成的退税草稿
 * Pos: 退税草稿自动生成服务
 */

const prisma = require('../utils/prisma');

const roundCurrency = (value) => Number(value.toFixed(2));

const buildRefundNo = (now, index) => {
  const datePart = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
  ].join('');

  return `TR-AUTO-${datePart}-${String(index).padStart(3, '0')}`;
};

const buildWhere = ({ customsDeclarationId, salesContractId } = {}) => {
  const where = {};

  if (customsDeclarationId) {
    where.id = customsDeclarationId;
  }
  if (salesContractId) {
    where.salesContractId = salesContractId;
  }

  return where;
};

const getLatestForexVerification = async (salesContractId, customsDeclarationId) => {
  return prisma.forexVerification.findFirst({
    where: {
      salesContractId,
      customsDeclarationId,
    },
    orderBy: [
      { verifiedAt: 'desc' },
      { createdAt: 'desc' },
    ],
  });
};

const getRefundRateForItem = async (item) => {
  if (!item.hsCode) {
    return null;
  }

  const record = await prisma.hsCode.findFirst({
    where: { hsCode: item.hsCode },
    orderBy: { effectiveDate: 'desc' },
  });

  if (!record) {
    return null;
  }

  if (typeof record.refundRate === 'number') {
    return record.refundRate;
  }
  if (typeof record.taxRate === 'number') {
    return record.taxRate;
  }
  return null;
};

const createDraftForDeclaration = async (declaration, now, index) => {
  let refundableAmount = 0;
  let matchedItems = 0;
  let missingRateItems = 0;

  for (const item of declaration.items || []) {
    if (typeof item.totalPrice !== 'number' || !Number.isFinite(item.totalPrice)) {
      continue;
    }

    const refundRate = await getRefundRateForItem(item);
    if (refundRate === null) {
      missingRateItems += 1;
      continue;
    }

    matchedItems += 1;
    refundableAmount += item.totalPrice * (refundRate / 100);
  }

  if (matchedItems === 0) {
    return {
      created: false,
      reason: 'no_rate_data',
      customsDeclarationId: declaration.id,
      refundId: null,
    };
  }

  const forexVerification = await getLatestForexVerification(declaration.salesContractId, declaration.id);
  const noteParts = [
    `自动生成草稿，来源报关单 ${declaration.declarationNo}`,
    `匹配明细 ${matchedItems} 条`,
  ];
  if (missingRateItems > 0) {
    noteParts.push(`未匹配退税率明细 ${missingRateItems} 条`);
  }

  const record = await prisma.taxRefund.create({
    data: {
      refundNo: buildRefundNo(now, index),
      salesContractId: declaration.salesContractId,
      customsDeclarationId: declaration.id,
      forexVerificationId: forexVerification?.id || null,
      status: 'DRAFT',
      declaredAmount: declaration.totalAmount || 0,
      refundableAmount: roundCurrency(refundableAmount),
      refundedAmount: 0,
      appliedAt: now,
      note: noteParts.join('；'),
    },
  });

  return {
    created: true,
    reason: null,
    customsDeclarationId: declaration.id,
    refundId: record.id,
  };
};

const generateTaxRefundDrafts = async (filters = {}) => {
  const declarations = await prisma.customsDeclaration.findMany({
    where: buildWhere(filters),
    include: {
      items: true,
    },
    orderBy: [
      { createdAt: 'asc' },
      { declarationNo: 'asc' },
    ],
  });

  const now = new Date();
  const items = [];
  let created = 0;
  let skipped = 0;
  let sequence = 1;

  for (const declaration of declarations) {
    const existing = await prisma.taxRefund.findFirst({
      where: { customsDeclarationId: declaration.id },
      orderBy: { createdAt: 'desc' },
    });

    if (existing && !filters.replaceExisting) {
      skipped += 1;
      items.push({
        customsDeclarationId: declaration.id,
        refundId: existing.id,
        reason: 'existing_refund',
      });
      continue;
    }

    if (existing && filters.replaceExisting) {
      await prisma.taxRefund.delete({
        where: { id: existing.id },
      });
    }

    const result = await createDraftForDeclaration(declaration, now, sequence);
    if (result.created) {
      created += 1;
      sequence += 1;
    } else {
      skipped += 1;
    }
    items.push(result);
  }

  return {
    created,
    skipped,
    items,
  };
};

module.exports = {
  generateTaxRefundDrafts,
};
