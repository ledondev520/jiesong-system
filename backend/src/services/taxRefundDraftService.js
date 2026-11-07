/**
 * Input: customs declarations, live HSCode rates, linked purchase cost, forex verification
 * Output: 自动生成的退税草稿（仅新建或原位更新 DRAFT，不触碰其他状态）
 * Pos: 退税草稿自动生成服务；口径同 exportReadinessService：外贸企业退税 = 含税采购成本¥ ÷ (1+进项税率) × 退税率
 */

const prisma = require('../utils/prisma');
const { roundMoney } = require('../utils/money');
const { createError } = require('../middleware/errorHandler');
const { normalizePurchaseTaxRate } = require('./purchaseAmountService');

const REFUND_NO_PREFIX = 'TR-AUTO-';
const REFUND_NO_RETRIES = 3;

const finiteOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const datePartOf = (now) => [
  now.getUTCFullYear(),
  String(now.getUTCMonth() + 1).padStart(2, '0'),
  String(now.getUTCDate()).padStart(2, '0'),
].join('');

/** 在事务内取当日已用最大序号 + 1，避免同日多次调用撞 refundNo。 */
const nextRefundNo = async (tx, now, retry = 0) => {
  const prefix = `${REFUND_NO_PREFIX}${datePartOf(now)}-`;
  const rows = await tx.taxRefund.findMany({
    where: { refundNo: { startsWith: prefix } },
    select: { refundNo: true },
  });
  const max = rows.reduce((acc, row) => {
    const seq = Number(String(row.refundNo).slice(prefix.length));
    return Number.isInteger(seq) && seq > acc ? seq : acc;
  }, 0);
  return `${prefix}${String(max + 1 + retry).padStart(3, '0')}`;
};

const buildWhere = ({ customsDeclarationId, salesContractId } = {}) => {
  // VOID 报关单永不生成退税草稿
  const where = { status: { not: 'VOID' } };

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

/** 只取 HsCode.refundRate；taxRate 是进口关税率，绝不能当出口退税率。 */
const getHsRecordForItem = async (item) => {
  if (!item.hsCode) {
    return null;
  }
  return prisma.hsCode.findFirst({
    where: { hsCode: item.hsCode },
    orderBy: { effectiveDate: 'desc' },
  });
};

const resolveVatRate = (item, hsRecord) => {
  const contractRate = finiteOrNull(item.packingItem?.purchaseItem?.purchaseContract?.taxRate);
  if (contractRate !== null) return normalizePurchaseTaxRate(contractRate);
  const hsVatRate = finiteOrNull(hsRecord?.vatRate);
  return hsVatRate !== null ? normalizePurchaseTaxRate(hsVatRate) : null;
};

const computeDraft = async (declaration) => {
  let refundableAmount = 0;
  let ratedItems = 0;
  let missingRateItems = 0;
  let unverifiedItems = 0;

  for (const item of declaration.items || []) {
    const hsRecord = await getHsRecordForItem(item);
    const refundRate = finiteOrNull(hsRecord?.refundRate);
    if (refundRate === null || refundRate < 0) {
      missingRateItems += 1;
      continue;
    }

    ratedItems += 1;
    const packing = item.packingItem;
    const purchaseCostCny = finiteOrNull(packing?.purchaseCost);
    const vatRate = resolveVatRate(item, hsRecord);
    // 第三方货、无采购关联或缺税率的历史报关单：不把美元 FOB 当人民币，基数记 0
    if (!packing || packing.isOwnedByJiesong === false || !(purchaseCostCny > 0) || vatRate === null) {
      unverifiedItems += 1;
      continue;
    }
    refundableAmount += (purchaseCostCny / (1 + vatRate / 100)) * (refundRate / 100);
  }

  const noteParts = [
    `自动生成草稿，来源报关单 ${declaration.declarationNo}`,
    `匹配明细 ${ratedItems} 条`,
  ];
  if (missingRateItems > 0) {
    noteParts.push(`缺少出口退税率明细 ${missingRateItems} 条（missingRefundRate）`);
  }
  if (unverifiedItems > 0) {
    noteParts.push(`UNVERIFIED_PURCHASE_BASIS：${unverifiedItems} 条明细缺少采购成本/税率关联，未计入应退税额`);
  }

  return { ratedItems, refundableAmount: roundMoney(refundableAmount), note: noteParts.join('；') };
};

const isRefundNoConflict = (error) => (
  error?.code === 'P2002' && String(error?.meta?.target ?? 'refundNo').includes('refundNo')
);

const writeDraft = async (declaration, existing, computed, forexVerification, now) => {
  const data = {
    forexVerificationId: forexVerification?.id || null,
    declaredAmount: declaration.totalAmount || 0,
    refundableAmount: computed.refundableAmount,
    note: computed.note,
  };

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        if (existing) {
          // updateMany 带状态条件：并发被推进到 APPLIED 等状态时不覆盖
          const { count } = await tx.taxRefund.updateMany({
            where: { id: existing.id, status: 'DRAFT' },
            data,
          });
          if (count !== 1) throw createError('退税记录已不是草稿，禁止替换', 409);
          return existing;
        }
        return tx.taxRefund.create({
          data: {
            ...data,
            refundNo: await nextRefundNo(tx, now, attempt),
            salesContractId: declaration.salesContractId,
            customsDeclarationId: declaration.id,
            status: 'DRAFT',
            refundedAmount: 0,
            appliedAt: now,
          },
        });
      });
    } catch (error) {
      if (!existing && isRefundNoConflict(error) && attempt < REFUND_NO_RETRIES) continue;
      throw error;
    }
  }
};

const generateTaxRefundDrafts = async (filters = {}) => {
  const declarations = await prisma.customsDeclaration.findMany({
    where: buildWhere(filters),
    include: {
      items: {
        include: {
          packingItem: {
            include: { purchaseItem: { include: { purchaseContract: { select: { taxRate: true } } } } },
          },
        },
      },
    },
    orderBy: [
      { createdAt: 'asc' },
      { declarationNo: 'asc' },
    ],
  });

  // 先全部查出已有退税：替换非 DRAFT 时整批拒绝，不产生部分写入
  const existingByDeclaration = new Map();
  for (const declaration of declarations) {
    const existing = await prisma.taxRefund.findFirst({
      where: { customsDeclarationId: declaration.id },
      orderBy: { createdAt: 'desc' },
    });
    if (existing && filters.replaceExisting && existing.status !== 'DRAFT') {
      throw createError(`报关单 ${declaration.declarationNo} 的退税记录状态为 ${existing.status}，仅草稿可替换`, 409);
    }
    existingByDeclaration.set(declaration.id, existing);
  }

  const now = new Date();
  const items = [];
  let created = 0;
  let skipped = 0;

  for (const declaration of declarations) {
    const existing = existingByDeclaration.get(declaration.id);

    if (existing && !filters.replaceExisting) {
      skipped += 1;
      items.push({
        customsDeclarationId: declaration.id,
        refundId: existing.id,
        reason: 'existing_refund',
      });
      continue;
    }

    const computed = await computeDraft(declaration);
    if (computed.ratedItems === 0) {
      skipped += 1;
      items.push({
        created: false,
        reason: 'no_rate_data',
        customsDeclarationId: declaration.id,
        refundId: existing?.id || null,
      });
      continue;
    }

    const forexVerification = await getLatestForexVerification(declaration.salesContractId, declaration.id);
    const record = await writeDraft(declaration, existing, computed, forexVerification, now);
    created += 1;
    items.push({
      created: true,
      reason: null,
      customsDeclarationId: declaration.id,
      refundId: record.id,
    });
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
