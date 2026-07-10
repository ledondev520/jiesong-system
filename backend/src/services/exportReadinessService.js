/**
 * Input: 出口合同装箱明细、历史报关 HS、当前税则快照、采购价税资料与人工确认覆盖
 * Output: 全量出口行、单证/退税准备度、HS 证据、出口定价建议与预计退税
 * Pos: 出口单证生成前的权威 Module，页面预览、三表生成和工作簿共用同一 Interface
 */

const prisma = require('../utils/prisma');
const { createError } = require('../middleware/errorHandler');
const { normalizePurchaseTaxRate, roundMoney } = require('./purchaseAmountService');

const DEFAULT_PROFIT_RATE = 1.3;
const PRICE_EPSILON = 0.01;

const toFiniteOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const toPositiveOrNull = (value) => {
  const number = toFiniteOrNull(value);
  return number !== null && number > 0 ? number : null;
};

const normalizeHsCode = (value) => String(value || '').replace(/\D/g, '').slice(0, 10);

const makeIssue = (code, severity, scope, message) => ({ code, severity, scope, message });

const getFirstByKey = (items, key) => {
  const map = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const value = item?.[key];
    if (value && !map.has(value)) map.set(value, item);
  }
  return map;
};

const resolveVatRate = (item, hsRecord, activeTaxRate) => {
  const purchaseRate = toFiniteOrNull(item?.purchaseItem?.purchaseContract?.taxRate);
  if (purchaseRate !== null) {
    return {
      value: normalizePurchaseTaxRate(purchaseRate),
      source: 'purchase_contract',
    };
  }

  const configuredRate = toFiniteOrNull(activeTaxRate?.purchaseTaxRate);
  if (configuredRate !== null) {
    return {
      value: normalizePurchaseTaxRate(configuredRate),
      source: 'product_tax_rate',
    };
  }

  const hsVatRate = toFiniteOrNull(hsRecord?.vatRate);
  if (hsVatRate !== null) {
    return {
      value: normalizePurchaseTaxRate(hsVatRate),
      source: 'hs_snapshot',
    };
  }

  return { value: null, source: null };
};

const resolveHsChoice = (item, override, historicalItem) => {
  const overrideCode = normalizeHsCode(override?.hsCode);
  if (overrideCode) {
    return { hsCode: overrideCode, hsSource: 'manual_confirmation' };
  }

  const historicalCode = normalizeHsCode(historicalItem?.hsCode);
  if (historicalCode) {
    return { hsCode: historicalCode, hsSource: 'customs_history' };
  }

  const productCode = normalizeHsCode(item?.product?.hsCode);
  if (productCode) {
    return { hsCode: productCode, hsSource: 'product_archive' };
  }

  return { hsCode: '', hsSource: 'missing' };
};

/**
 * 职责：以纯函数方式计算出口行准备度，便于页面、生成器和测试共用同一契约。
 */
const evaluateExportReadiness = (contract = {}, {
  overrides = [],
  historicalItems = [],
  hsRecords = [],
  activeTaxRates = [],
  profitRate = DEFAULT_PROFIT_RATE,
} = {}) => {
  const safeProfitRate = toPositiveOrNull(profitRate) || DEFAULT_PROFIT_RATE;
  const exchangeRate = toPositiveOrNull(contract.exchangeRate);
  const overrideByPackingItem = getFirstByKey(overrides, 'packingItemId');
  const historyByProduct = getFirstByKey(historicalItems, 'productId');
  const hsByCode = new Map(
    (Array.isArray(hsRecords) ? hsRecords : [])
      .map((record) => [normalizeHsCode(record?.hsCode), record])
      .filter(([code]) => code),
  );
  const taxRateByProduct = getFirstByKey(activeTaxRates, 'productId');

  const lines = (Array.isArray(contract.packingItems) ? contract.packingItems : []).map((item, index) => {
    const issues = [];
    const productName = item?.product?.customsName || '未知商品';
    const override = overrideByPackingItem.get(item.id);
    const historicalItem = historyByProduct.get(item.productId);
    const { hsCode, hsSource } = resolveHsChoice(item, override, historicalItem);
    const hsRecord = hsCode.length === 10 ? hsByCode.get(hsCode) : null;
    const quantity = toPositiveOrNull(item.quantity) || 0;
    const purchaseCostCny = toPositiveOrNull(item.purchaseCost);
    const unitPriceUsd = toPositiveOrNull(item.unitPrice);
    const calculatedTotalPriceUsd = unitPriceUsd && quantity
      ? roundMoney(unitPriceUsd * quantity)
      : null;
    const storedTotalPriceUsd = toPositiveOrNull(item.totalPrice);
    const recommendedUnitPriceUsd = purchaseCostCny && exchangeRate && quantity
      ? roundMoney((purchaseCostCny * safeProfitRate) / exchangeRate / quantity)
      : null;

    if (!hsCode) {
      issues.push(makeIssue('MISSING_HS_CODE', 'error', 'all', '缺少 10 位 HS 编码'));
    } else if (hsCode.length !== 10) {
      issues.push(makeIssue('INVALID_HS_CODE', 'error', 'all', 'HS 编码必须为 10 位数字'));
    } else if (!hsRecord) {
      issues.push(makeIssue(
        'HS_CURRENT_EVIDENCE_MISSING',
        'error',
        'all',
        '当前税则快照中没有该 HS 编码，需先查询或人工更新后再生成单证',
      ));
    }

    if (!unitPriceUsd) {
      issues.push(makeIssue('MISSING_EXPORT_PRICE', 'error', 'customs', '缺少出口单价'));
    } else if (
      storedTotalPriceUsd
      && calculatedTotalPriceUsd
      && Math.abs(storedTotalPriceUsd - calculatedTotalPriceUsd) > PRICE_EPSILON
    ) {
      issues.push(makeIssue(
        'STORED_TOTAL_RECALCULATED',
        'warning',
        'customs',
        '已按出口单价 × 数量重新计算总价，原存储总价存在差异',
      ));
    }

    const declarationElements = String(item?.product?.declaration || '').trim();
    if (!declarationElements) {
      issues.push(makeIssue(
        'MISSING_DECLARATION_ELEMENTS',
        'error',
        'customs',
        '缺少已确认的申报要素；税则模板只能作为填写提示，不能代替实际参数',
      ));
    }

    const refundRate = toFiniteOrNull(hsRecord?.refundRate);
    if (refundRate === null) {
      issues.push(makeIssue('MISSING_REFUND_RATE', 'error', 'tax_refund', '当前税则未提供出口退税率'));
    } else if (refundRate === 0) {
      issues.push(makeIssue(
        'NO_EXPORT_REFUND',
        'warning',
        'tax_refund',
        '当前退税率为 0%，该商品货值无法申请出口退税',
      ));
    }

    if (!purchaseCostCny) {
      issues.push(makeIssue(
        'MISSING_PURCHASE_COST',
        'error',
        'tax_refund',
        '缺少与本柜对应的采购含税成本，无法形成外贸企业退税估算基数',
      ));
    }

    const vatRate = resolveVatRate(item, hsRecord, taxRateByProduct.get(item.productId));
    if (vatRate.value === null) {
      issues.push(makeIssue(
        'MISSING_PURCHASE_VAT_RATE',
        'error',
        'tax_refund',
        '缺少采购专票税率，无法从含税采购成本推导发票注明金额',
      ));
    }

    const refundBaseCny = purchaseCostCny && vatRate.value !== null
      ? roundMoney(purchaseCostCny / (1 + vatRate.value / 100))
      : 0;
    const estimatedRefundCny = refundRate !== null
      ? roundMoney(refundBaseCny * (refundRate / 100))
      : 0;
    const nonRefundableInputTaxCny = refundRate !== null && vatRate.value !== null
      ? roundMoney(refundBaseCny * (Math.max(vatRate.value - refundRate, 0) / 100))
      : 0;

    return {
      index: index + 1,
      packingItemId: item.id,
      productId: item.productId,
      productName,
      storeName: item?.store?.name || '',
      quantity,
      unit: item.unit || item.product?.unit || '',
      hsCode,
      hsSource,
      hsEvidence: hsRecord ? {
        productName: hsRecord.productName,
        refundRate,
        vatRate: toFiniteOrNull(hsRecord.vatRate),
        effectiveDate: hsRecord.effectiveDate || null,
        fetchedAt: hsRecord.fetchedAt || null,
        sourceUrl: hsRecord.sourceUrl || null,
      } : null,
      declarationElements,
      declarationTemplate: hsRecord?.declarationElements || '',
      unitPriceUsd: unitPriceUsd || 0,
      totalPriceUsd: calculatedTotalPriceUsd || 0,
      storedTotalPriceUsd: storedTotalPriceUsd || 0,
      recommendedUnitPriceUsd,
      pricingFormula: 'purchaseCostCny × 1.3 ÷ exchangeRate ÷ quantity',
      pricingProfitRate: safeProfitRate,
      exchangeRate: exchangeRate || 0,
      purchaseCostCny: purchaseCostCny || 0,
      purchaseVatRate: vatRate.value,
      purchaseVatRateSource: vatRate.source,
      refundBaseCny,
      estimatedRefundCny,
      nonRefundableInputTaxCny,
      note: item.note || '',
      issues,
    };
  });

  const globalIssues = [];
  if (lines.length === 0) {
    globalIssues.push(makeIssue('NO_PACKING_ITEMS', 'error', 'all', '当前货柜没有装箱明细'));
  }

  const totalExportAmountUsd = roundMoney(lines.reduce((sum, line) => sum + line.totalPriceUsd, 0));
  const storedContractTotalUsd = roundMoney(contract.totalAmount || 0);
  if (
    totalExportAmountUsd > 0
    && storedContractTotalUsd > 0
    && Math.abs(totalExportAmountUsd - storedContractTotalUsd) > PRICE_EPSILON
  ) {
    globalIssues.push(makeIssue(
      'CONTRACT_TOTAL_MISMATCH',
      'warning',
      'customs',
      '出口合同总额与装箱明细按单价计算的合计不一致',
    ));
  }

  const allIssues = [
    ...globalIssues,
    ...lines.flatMap((line) => line.issues.map((issue) => ({
      ...issue,
      packingItemId: line.packingItemId,
      productName: line.productName,
    }))),
  ];
  const hasErrorsFor = (scope) => allIssues.some((issue) => (
    issue.severity === 'error' && (issue.scope === 'all' || issue.scope === scope)
  ));

  return {
    contractId: contract.id,
    contractNo: contract.contractNo,
    portName: contract.port?.name || '',
    note: contract.note || '',
    exchangeRate: exchangeRate || 0,
    profitRate: safeProfitRate,
    customsReady: !hasErrorsFor('customs'),
    taxRefundReady: !hasErrorsFor('tax_refund'),
    lines,
    issues: allIssues,
    summary: {
      lineCount: lines.length,
      totalExportAmountUsd,
      storedContractTotalUsd,
      totalPurchaseCostCny: roundMoney(lines.reduce((sum, line) => sum + line.purchaseCostCny, 0)),
      totalRefundBaseCny: roundMoney(lines.reduce((sum, line) => sum + line.refundBaseCny, 0)),
      totalEstimatedRefundCny: roundMoney(lines.reduce((sum, line) => sum + line.estimatedRefundCny, 0)),
      totalNonRefundableInputTaxCny: roundMoney(lines.reduce((sum, line) => sum + line.nonRefundableInputTaxCny, 0)),
      noRefundLineCount: lines.filter((line) => line.hsEvidence?.refundRate === 0).length,
      errorCount: allIssues.filter((issue) => issue.severity === 'error').length,
      warningCount: allIssues.filter((issue) => issue.severity === 'warning').length,
    },
  };
};

const getExportReadiness = async (salesContractId, {
  overrides = [],
  profitRate = DEFAULT_PROFIT_RATE,
} = {}, prismaClient = prisma) => {
  const contract = await prismaClient.salesContract.findUnique({
    where: { id: salesContractId },
    include: {
      port: true,
      packingItems: {
        include: {
          product: true,
          store: true,
          purchaseItem: {
            select: {
              purchaseContract: { select: { taxRate: true } },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  if (!contract) throw createError('出口合同不存在', 404);

  const packingItemIds = new Set(contract.packingItems.map((item) => item.id));
  const unknownOverride = overrides.find((item) => !packingItemIds.has(item?.packingItemId));
  if (unknownOverride) throw createError(`装箱明细 ${unknownOverride.packingItemId} 不属于当前出口合同`, 400);

  const productIds = Array.from(new Set(contract.packingItems.map((item) => item.productId).filter(Boolean)));
  const historicalItems = productIds.length > 0
    ? await prismaClient.customsDeclarationItem.findMany({
        where: {
          productId: { in: productIds },
          hsCode: { not: null },
        },
        select: { productId: true, hsCode: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      })
    : [];

  const preliminaryCodes = contract.packingItems.map((item) => {
    const override = overrides.find((entry) => entry?.packingItemId === item.id);
    const historical = historicalItems.find((entry) => entry.productId === item.productId);
    return resolveHsChoice(item, override, historical).hsCode;
  }).filter((code) => code.length === 10);
  const uniqueCodes = Array.from(new Set(preliminaryCodes));
  const now = new Date();

  const [hsRecords, activeTaxRates] = await Promise.all([
    uniqueCodes.length > 0
      ? prismaClient.hsCode.findMany({ where: { hsCode: { in: uniqueCodes } } })
      : [],
    productIds.length > 0
      ? prismaClient.taxRate.findMany({
          where: {
            productId: { in: productIds },
            isActive: true,
            effectiveFrom: { lte: now },
            OR: [
              { effectiveTo: null },
              { effectiveTo: { gte: now } },
            ],
          },
          orderBy: { effectiveFrom: 'desc' },
        })
      : [],
  ]);

  return evaluateExportReadiness(contract, {
    overrides,
    historicalItems,
    hsRecords,
    activeTaxRates,
    profitRate,
  });
};

const assertExportReadiness = (readiness, {
  requireCustoms = true,
  requireTaxRefund = false,
} = {}) => {
  const blocking = readiness.issues.filter((issue) => (
    issue.severity === 'error'
    && (
      issue.scope === 'all'
      || (requireCustoms && issue.scope === 'customs')
      || (requireTaxRefund && issue.scope === 'tax_refund')
    )
  ));
  if (blocking.length === 0) return readiness;

  const first = blocking[0];
  const prefix = first.productName ? `${first.productName}：` : '';
  throw createError(`出口单证资料未完整：${prefix}${first.message}`, 400);
};

module.exports = {
  DEFAULT_PROFIT_RATE,
  assertExportReadiness,
  evaluateExportReadiness,
  getExportReadiness,
  normalizeHsCode,
};
