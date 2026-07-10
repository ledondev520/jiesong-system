/**
 * Input: 采购明细的规格、箱数、总毛净重、总体积与可选箱体尺寸
 * Output: 可解释的生产资料完整性、汇总指标与批量保存结果
 * Pos: 采购生产阶段的权威 Module，状态推进和页面共用同一 Interface
 */

const prisma = require('../utils/prisma');
const { createError } = require('../middleware/errorHandler');

const FIELD_ISSUES = Object.freeze({
  specification: { code: 'MISSING_SPECIFICATION', label: '规格' },
  boxes: { code: 'MISSING_BOXES', label: '箱数' },
  grossWeight: { code: 'MISSING_GROSS_WEIGHT', label: '总毛重' },
  netWeight: { code: 'MISSING_NET_WEIGHT', label: '总净重' },
  volume: { code: 'MISSING_VOLUME', label: '总体积' },
});

const toFiniteOrNull = (value, label) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) throw createError(`${label}必须为数字`, 400);
  if (number < 0) throw createError(`${label}不能为负数`, 400);
  return number;
};

const normalizeProductionDetailInput = (input = {}) => {
  const id = typeof input.id === 'string' ? input.id.trim() : '';
  if (!id) throw createError('采购明细ID不能为空', 400);

  const boxes = toFiniteOrNull(input.boxes, '箱数');
  if (boxes !== null && !Number.isInteger(boxes)) {
    throw createError('箱数必须为非负整数', 400);
  }

  return {
    id,
    specification: typeof input.specification === 'string' ? input.specification.trim() : '',
    boxes,
    grossWeight: toFiniteOrNull(input.grossWeight, '毛重'),
    netWeight: toFiniteOrNull(input.netWeight, '净重'),
    volume: toFiniteOrNull(input.volume, '体积'),
    length: toFiniteOrNull(input.length, '长度'),
    width: toFiniteOrNull(input.width, '宽度'),
    height: toFiniteOrNull(input.height, '高度'),
  };
};

const hasPositive = (value) => Number.isFinite(Number(value)) && Number(value) > 0;

const evaluatePurchaseProductionReadiness = (items = []) => {
  const results = (Array.isArray(items) ? items : []).map((item) => {
    const issues = [];
    if (!String(item?.specification || '').trim()) issues.push(FIELD_ISSUES.specification);
    if (!Number.isInteger(Number(item?.boxes)) || Number(item?.boxes) <= 0) issues.push(FIELD_ISSUES.boxes);
    if (!hasPositive(item?.grossWeight)) issues.push(FIELD_ISSUES.grossWeight);
    if (!hasPositive(item?.netWeight)) issues.push(FIELD_ISSUES.netWeight);
    if (!hasPositive(item?.volume)) issues.push(FIELD_ISSUES.volume);

    if (
      hasPositive(item?.grossWeight)
      && hasPositive(item?.netWeight)
      && Number(item.netWeight) > Number(item.grossWeight)
    ) {
      issues.push({ code: 'NET_WEIGHT_EXCEEDS_GROSS', label: '净重不能大于毛重' });
    }

    const dimensions = [item?.length, item?.width, item?.height];
    const filledDimensionCount = dimensions.filter(hasPositive).length;
    if (filledDimensionCount > 0 && filledDimensionCount < 3) {
      issues.push({ code: 'INCOMPLETE_DIMENSIONS', label: '箱体长宽高需成套填写' });
    }

    return {
      id: item?.id,
      ready: issues.length === 0,
      issues,
      dimensionsEstimated: filledDimensionCount === 0,
    };
  });

  const totals = (Array.isArray(items) ? items : []).reduce((sum, item) => ({
    boxes: sum.boxes + (hasPositive(item?.boxes) ? Number(item.boxes) : 0),
    grossWeight: sum.grossWeight + (hasPositive(item?.grossWeight) ? Number(item.grossWeight) : 0),
    netWeight: sum.netWeight + (hasPositive(item?.netWeight) ? Number(item.netWeight) : 0),
    volume: sum.volume + (hasPositive(item?.volume) ? Number(item.volume) : 0),
  }), { boxes: 0, grossWeight: 0, netWeight: 0, volume: 0 });

  const incompleteItemCount = results.filter((item) => !item.ready).length;
  return {
    ready: results.length > 0 && incompleteItemCount === 0,
    itemCount: results.length,
    incompleteItemCount,
    estimatedDimensionItemCount: results.filter((item) => item.dimensionsEstimated).length,
    items: results,
    totals,
  };
};

const assertPurchaseProductionReady = (items = []) => {
  const readiness = evaluatePurchaseProductionReadiness(items);
  if (readiness.ready) return readiness;

  if (readiness.itemCount === 0) {
    throw createError('采购合同没有商品明细，不能确认生产完成', 400);
  }
  const missing = readiness.items
    .filter((item) => !item.ready)
    .map((item) => `${item.id || '未知明细'}：${item.issues.map((issue) => issue.label).join('、')}`)
    .join('；');
  throw createError(`生产资料未完整：${missing}`, 400);
};

const updatePurchaseProductionDetails = async (
  contractId,
  inputs,
  prismaClient = prisma,
) => {
  if (!contractId) throw createError('采购合同ID不能为空', 400);
  if (!Array.isArray(inputs) || inputs.length === 0) {
    throw createError('至少提交一条生产资料', 400);
  }

  const normalizedInputs = inputs.map(normalizeProductionDetailInput);
  if (new Set(normalizedInputs.map((item) => item.id)).size !== normalizedInputs.length) {
    throw createError('生产资料包含重复的采购明细', 400);
  }

  return prismaClient.$transaction(async (tx) => {
    const contract = await tx.purchaseContract.findUnique({
      where: { id: contractId },
      select: {
        id: true,
        items: { select: { id: true } },
      },
    });
    if (!contract) throw createError('采购合同不存在', 404);

    const allowedIds = new Set(contract.items.map((item) => item.id));
    const unknown = normalizedInputs.find((item) => !allowedIds.has(item.id));
    if (unknown) throw createError(`采购明细 ${unknown.id} 不属于当前合同`, 400);

    for (const item of normalizedInputs) {
      const { id, ...data } = item;
      await tx.purchaseItem.update({ where: { id }, data });
    }

    return tx.purchaseContract.findUnique({
      where: { id: contractId },
      include: {
        supplier: true,
        items: { include: { product: true } },
        payments: { orderBy: { paymentDate: 'desc' } },
      },
    });
  });
};

module.exports = {
  assertPurchaseProductionReady,
  evaluatePurchaseProductionReadiness,
  normalizeProductionDetailInput,
  updatePurchaseProductionDetails,
};
