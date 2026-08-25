/**
 * Input: 单份出口合同、关联采购合同与出口退税准备度
 * Output: 排除第三方拼柜后的美元收入、人民币采购成本、预计商品毛利与现金流
 * Pos: 一个出口专项单的一站式财务结算 Module；不把不同币种直接相加
 */

const prisma = require('../utils/prisma');
const { createError } = require('../middleware/errorHandler');
const { getExportReadiness } = require('./exportReadinessService');
const {
  getEffectiveSalesContractTotal,
  getEffectiveSalesReceived,
  isJiesongOwnedPackingItem,
} = require('./salesContractAmount');

const SALES_SETTLEMENT_TYPES = new Set(['RECEIVABLE', 'RECEIVABLE_COLLECTION', 'INCOME']);
const ROUNDING_EPSILON = Number.EPSILON;

const roundMoney = (value) => Math.round((Number(value || 0) + ROUNDING_EPSILON) * 100) / 100;
const roundPercent = (value) => Math.round((Number(value || 0) + ROUNDING_EPSILON) * 100) / 100;
const normalizeCurrency = (value) => String(value || '').trim().toUpperCase();
const normalizeContractNo = (value) => String(value || '').replace(/\s+/g, '').toUpperCase();
const unique = (values) => Array.from(new Set(values.filter(Boolean)));

const contractNoAliases = (value) => unique([
  normalizeContractNo(value),
  normalizeContractNo(value).replace(/^PO/, 'CG'),
  normalizeContractNo(value).replace(/^CG/, 'PO'),
]);

const makeIssue = (code, severity, message) => ({ code, severity, message });
const dedupeIssues = (issues) => Array.from(new Map(
  issues.map((issue) => [`${issue.code}:${issue.message}`, issue]),
).values());

const getPurchaseMap = (purchases = []) => {
  const map = new Map();
  purchases.forEach((purchase) => {
    contractNoAliases(purchase?.contractNo).forEach((alias) => map.set(alias, purchase));
  });
  return map;
};

/**
 * 这是财务页面与测试共同跨越的唯一 Interface：
 * 同一份事实只在这里完成所有权、币种、付款分摊和毛利口径计算。
 */
const buildSalesFinanceSummary = ({
  salesContract,
  purchases = [],
  exportReadiness = { lines: [] },
  exportReadinessError = null,
}) => {
  if (!salesContract) throw createError('出口合同不存在', 404);

  const packingItems = Array.isArray(salesContract.packingItems) ? salesContract.packingItems : [];
  const ownedItems = packingItems.filter(isJiesongOwnedPackingItem);
  const thirdPartyItems = packingItems.filter((item) => !isJiesongOwnedPackingItem(item));
  const issues = [];

  const packedRevenueUsd = roundMoney(packingItems.reduce((sum, item) => sum + Number(item.totalPrice || 0), 0));
  const contractTotalUsd = roundMoney(salesContract.totalAmount);
  const ownedRevenueUsd = roundMoney(getEffectiveSalesContractTotal(salesContract));
  const ownershipRatio = contractTotalUsd > 0
    ? Math.min(Math.max(ownedRevenueUsd / contractTotalUsd, 0), 1)
    : 1;

  if (packingItems.length > 0 && Math.abs(packedRevenueUsd - contractTotalUsd) > 0.01) {
    issues.push(makeIssue(
      'CONTRACT_REVENUE_MISMATCH',
      'warning',
      '合同总额与装箱明细销售金额不一致；收入以合同总额扣除已知第三方货值为准',
    ));
  }

  if (thirdPartyItems.length > 0) {
    const sources = unique(thirdPartyItems.map((item) => item.sourceParty || '第三方拼柜'));
    issues.push(makeIssue(
      'THIRD_PARTY_REVENUE_EXCLUDED',
      'info',
      `已排除第三方拼柜收入：${sources.join('、')}`,
    ));
  }
  if (packingItems.length > 0 && ownedRevenueUsd <= 0) {
    issues.push(makeIssue('MISSING_OWNED_REVENUE', 'error', '自有装箱明细缺少美元销售金额，无法计算商品毛利'));
  }

  const settlementPayments = (salesContract.payments || []).filter((payment) => (
    SALES_SETTLEMENT_TYPES.has(payment?.type)
  ));
  const unsupportedReceipts = settlementPayments.filter((payment) => normalizeCurrency(payment.currency) !== 'USD');
  const usdReceipts = settlementPayments.filter((payment) => normalizeCurrency(payment.currency) === 'USD');
  if (unsupportedReceipts.length > 0) {
    issues.push(makeIssue(
      'UNSUPPORTED_RECEIPT_CURRENCY',
      'error',
      `发现 ${unsupportedReceipts.length} 笔非 USD 销售收款，未计入美元应收与现金流`,
    ));
  }

  let receivedSource = 'payment_records';
  let totalReceivedUsd = roundMoney(usdReceipts.reduce((sum, payment) => sum + Number(payment.amount || 0), 0));
  if (settlementPayments.length === 0) {
    totalReceivedUsd = roundMoney(salesContract.receivedAmount);
    if (totalReceivedUsd > 0) {
      receivedSource = 'legacy_contract_balance';
      issues.push(makeIssue(
        'LEGACY_RECEIPT_BALANCE',
        'warning',
        '当前已收金额来自历史合同汇总字段；建议补录逐笔美元收款流水',
      ));
    }
  }

  const receivedUsd = roundMoney(getEffectiveSalesReceived(
    salesContract,
    ownedRevenueUsd,
    totalReceivedUsd,
  ));
  const outstandingUsd = roundMoney(Math.max(ownedRevenueUsd - receivedUsd, 0));
  if (totalReceivedUsd > contractTotalUsd + 0.01) {
    issues.push(makeIssue('RECEIPT_EXCEEDS_REVENUE', 'warning', '美元收款超过当前自有货物收入，超出部分未计入本柜收入'));
  }
  if (
    settlementPayments.length > 0
    && Math.abs(Number(salesContract.receivedAmount || 0) - totalReceivedUsd) > 0.01
  ) {
    issues.push(makeIssue(
      'LEGACY_BALANCE_MISMATCH',
      'warning',
      '合同已收汇总与逐笔 USD 收款不一致；本页以逐笔流水为准',
    ));
  }

  const purchaseMap = getPurchaseMap(purchases);
  const linkedCostMap = new Map();
  let hasMissingPurchaseCost = false;
  ownedItems.forEach((item) => {
    if (item.purchaseCost === null || item.purchaseCost === undefined) {
      hasMissingPurchaseCost = true;
      return;
    }
    const cost = Number(item.purchaseCost || 0);
    const contractNo = normalizeContractNo(item.purchaseContractNo);
    if (!contractNo) {
      if (cost > 0) {
        issues.push(makeIssue('MISSING_PURCHASE_LINK', 'warning', '存在采购成本，但装箱明细未关联采购合同'));
      }
      return;
    }
    linkedCostMap.set(contractNo, roundMoney((linkedCostMap.get(contractNo) || 0) + cost));
  });
  if (hasMissingPurchaseCost) {
    issues.push(makeIssue('MISSING_PURCHASE_COST', 'error', '存在自有装箱明细未录入人民币采购成本'));
  }

  const purchaseCostCny = roundMoney(ownedItems.reduce((sum, item) => (
    sum + Number(item.purchaseCost || 0)
  ), 0));
  const linkedPurchases = [];
  let paidPurchaseCostCny = 0;
  linkedCostMap.forEach((allocatedCostCny, sourceContractNo) => {
    const purchase = contractNoAliases(sourceContractNo)
      .map((alias) => purchaseMap.get(alias))
      .find(Boolean);
    if (!purchase) {
      issues.push(makeIssue(
        'PURCHASE_CONTRACT_NOT_FOUND',
        'warning',
        `采购合同 ${sourceContractNo} 未找到，已计成本但无法分摊已付款`,
      ));
      linkedPurchases.push({
        id: null,
        contractNo: sourceContractNo,
        supplierName: null,
        allocatedCostCny,
        allocatedPaidCny: 0,
        outstandingCny: allocatedCostCny,
        allocationRatioPct: 0,
        lastPaymentAt: null,
      });
      return;
    }
    const purchaseTotalCny = Number(purchase.totalAmount || 0);
    const paidCny = Math.max(Number(purchase.paidAmount || 0), 0);
    const allocationRatio = purchaseTotalCny > 0
      ? Math.min(Math.max(allocatedCostCny / purchaseTotalCny, 0), 1)
      : 0;
    const allocatedPaidCny = roundMoney(Math.min(paidCny * allocationRatio, allocatedCostCny));
    paidPurchaseCostCny = roundMoney(paidPurchaseCostCny + allocatedPaidCny);
    const latestPaymentAt = [...(purchase.payments || [])]
      .map((payment) => payment?.paymentDate)
      .filter(Boolean)
      .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] || null;
    linkedPurchases.push({
      id: purchase.id,
      contractNo: purchase.contractNo,
      supplierName: purchase.supplier?.name || null,
      allocatedCostCny,
      allocatedPaidCny,
      outstandingCny: roundMoney(Math.max(allocatedCostCny - allocatedPaidCny, 0)),
      allocationRatioPct: roundPercent(allocationRatio * 100),
      lastPaymentAt: latestPaymentAt,
    });
  });
  const outstandingPurchaseCostCny = roundMoney(Math.max(purchaseCostCny - paidPurchaseCostCny, 0));

  const ownedItemIds = new Set(ownedItems.map((item) => item.id));
  const estimatedRefundCny = roundMoney((exportReadiness?.lines || []).reduce((sum, line) => (
    ownedItemIds.has(line.packingItemId) ? sum + Number(line.estimatedRefundCny || 0) : sum
  ), 0));
  const actualRefundedCny = roundMoney((salesContract.taxRefunds || []).reduce((sum, refund) => (
    sum + Math.max(Number(refund.refundedAmount || 0), 0)
  ), 0));
  if (exportReadinessError) {
    issues.push(makeIssue('REFUND_ESTIMATE_UNAVAILABLE', 'warning', exportReadinessError));
  }

  const exchangeRate = Number(salesContract.exchangeRate || 0);
  if (!(exchangeRate > 0)) {
    issues.push(makeIssue('MISSING_EXCHANGE_RATE', 'error', '出口合同缺少有效汇率，无法折算人民币收入和现金流'));
  }
  const expectedRevenueCny = exchangeRate > 0 ? roundMoney(ownedRevenueUsd * exchangeRate) : 0;
  const estimatedGrossProfitCny = roundMoney(expectedRevenueCny - purchaseCostCny + estimatedRefundCny);
  const estimatedGrossMarginPct = expectedRevenueCny > 0
    ? roundPercent((estimatedGrossProfitCny / expectedRevenueCny) * 100)
    : 0;
  const customerReceiptsCny = exchangeRate > 0 ? roundMoney(receivedUsd * exchangeRate) : 0;
  const netCashCny = roundMoney(customerReceiptsCny + actualRefundedCny - paidPurchaseCostCny);
  const attributedReceiptTotal = totalReceivedUsd * ownershipRatio;
  const receiptAttributionScale = attributedReceiptTotal > ownedRevenueUsd && attributedReceiptTotal > 0
    ? ownedRevenueUsd / attributedReceiptTotal
    : 1;

  const marginReady = !issues.some((issue) => (
    issue.severity === 'error'
    && ['MISSING_OWNED_REVENUE', 'MISSING_PURCHASE_COST', 'MISSING_EXCHANGE_RATE'].includes(issue.code)
  ));
  const cashReady = !issues.some((issue) => (
    issue.severity === 'error'
    && ['UNSUPPORTED_RECEIPT_CURRENCY', 'MISSING_EXCHANGE_RATE'].includes(issue.code)
  ));

  return {
    salesContractId: salesContract.id,
    contractNo: salesContract.contractNo,
    currencyPolicy: {
      salesReceiptCurrency: 'USD',
      purchasePaymentCurrency: 'CNY',
      conversionRate: exchangeRate > 0 ? exchangeRate : null,
    },
    marginReady,
    cashReady,
    revenue: {
      contractTotalUsd,
      ownedRevenueUsd,
      receivedUsd,
      outstandingUsd,
      receivedSource,
    },
    cost: {
      purchaseCostCny,
      paidPurchaseCostCny,
      outstandingPurchaseCostCny,
    },
    tax: {
      estimatedRefundCny,
      actualRefundedCny,
    },
    profit: {
      expectedRevenueCny,
      estimatedGrossProfitCny,
      estimatedGrossMarginPct,
      scope: '商品口径：自有货物美元收入按合同汇率折算 - 含税采购成本 + 预计出口退税；不含海运、报关、银行及管理费用',
    },
    cashFlow: {
      customerReceiptsCny,
      actualTaxRefundCny: actualRefundedCny,
      supplierPaymentsCny: paidPurchaseCostCny,
      netCashCny,
    },
    receipts: usdReceipts.map((payment) => ({
      id: payment.id,
      amountUsd: roundMoney(Number(payment.amount || 0) * ownershipRatio * receiptAttributionScale),
      paymentDate: payment.paymentDate || null,
      paymentMethod: payment.paymentMethod || null,
      note: payment.note || null,
    })),
    linkedPurchases,
    issues: dedupeIssues(issues),
  };
};

const getSalesFinanceSummary = async (
  salesContractId,
  { prismaClient = prisma, readinessLoader = getExportReadiness } = {},
) => {
  const salesContract = await prismaClient.salesContract.findUnique({
    where: { id: salesContractId },
    include: {
      packingItems: { orderBy: { createdAt: 'asc' } },
      payments: { orderBy: { paymentDate: 'desc' } },
      taxRefunds: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!salesContract) throw createError('出口合同不存在', 404);

  const sourceContractNos = unique((salesContract.packingItems || [])
    .filter(isOwnedPackingItem)
    .map((item) => normalizeContractNo(item.purchaseContractNo)));
  const purchaseAliases = unique(sourceContractNos.flatMap(contractNoAliases));
  const purchases = purchaseAliases.length > 0
    ? await prismaClient.purchaseContract.findMany({
        where: { contractNo: { in: purchaseAliases } },
        include: {
          supplier: { select: { id: true, name: true } },
          payments: {
            where: { currency: 'CNY' },
            select: { id: true, amount: true, paymentDate: true },
            orderBy: { paymentDate: 'desc' },
          },
        },
      })
    : [];

  let exportReadiness = { lines: [] };
  let exportReadinessError = null;
  try {
    exportReadiness = await readinessLoader(salesContractId);
  } catch (error) {
    exportReadinessError = `预计退税暂不可用：${error?.message || '出口资料校验失败'}`;
  }

  return buildSalesFinanceSummary({ salesContract, purchases, exportReadiness, exportReadinessError });
};

module.exports = {
  buildSalesFinanceSummary,
  getSalesFinanceSummary,
};
