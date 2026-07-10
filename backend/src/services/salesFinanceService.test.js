/**
 * Input: salesFinanceService 与出口合同、采购付款、退税估算事实
 * Output: 单柜收入、采购成本、现金流和商品口径预计毛利回归测试
 * Pos: 出口专项单财务汇总 Module 测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSalesFinanceSummary } = require('./salesFinanceService');

const salesContract = {
  id: 'sales-1',
  contractNo: 'EXP260001',
  totalAmount: 1000,
  receivedAmount: 0,
  exchangeRate: 7,
  packingItems: [
    {
      id: 'packing-owned',
      isOwnedByJiesong: true,
      purchaseContractNo: 'PO260001',
      purchaseCost: 3000,
      totalPrice: 600,
      quantity: 10,
    },
    {
      id: 'packing-third-party',
      isOwnedByJiesong: false,
      sourceParty: '第三方拼柜',
      purchaseCost: 0,
      totalPrice: 400,
      quantity: 5,
    },
  ],
  payments: [{
    id: 'receipt-1',
    type: 'RECEIVABLE',
    currency: 'USD',
    amount: 400,
    paymentDate: new Date('2026-07-01T00:00:00.000Z'),
    paymentMethod: 'wire',
  }],
  taxRefunds: [{ id: 'refund-1', status: 'REFUNDED', refundedAmount: 100 }],
};

const purchases = [{
  id: 'purchase-1',
  contractNo: 'PO260001',
  totalAmount: 3000,
  paidAmount: 1500,
  supplier: { id: 'supplier-1', name: '供应商A' },
  payments: [{ paymentDate: new Date('2026-06-10T00:00:00.000Z') }],
}];

const exportReadiness = {
  lines: [{ packingItemId: 'packing-owned', estimatedRefundCny: 200 }],
};

test('buildSalesFinanceSummary: 排除第三方拼柜并形成美元收入、人民币成本和现金流', () => {
  const result = buildSalesFinanceSummary({ salesContract, purchases, exportReadiness });

  assert.equal(result.marginReady, true);
  assert.deepEqual(result.revenue, {
    contractTotalUsd: 1000,
    ownedRevenueUsd: 600,
    receivedUsd: 240,
    outstandingUsd: 360,
    receivedSource: 'payment_records',
  });
  assert.deepEqual(result.cost, {
    purchaseCostCny: 3000,
    paidPurchaseCostCny: 1500,
    outstandingPurchaseCostCny: 1500,
  });
  assert.equal(result.tax.estimatedRefundCny, 200);
  assert.equal(result.tax.actualRefundedCny, 100);
  assert.equal(result.profit.expectedRevenueCny, 4200);
  assert.equal(result.profit.estimatedGrossProfitCny, 1400);
  assert.equal(result.profit.estimatedGrossMarginPct, 33.33);
  assert.deepEqual(result.cashFlow, {
    customerReceiptsCny: 1680,
    actualTaxRefundCny: 100,
    supplierPaymentsCny: 1500,
    netCashCny: 280,
  });
  assert.equal(result.linkedPurchases[0].allocationRatioPct, 100);
  assert.ok(result.issues.some((issue) => issue.code === 'THIRD_PARTY_REVENUE_EXCLUDED'));
});

test('buildSalesFinanceSummary: 缺采购成本时不得宣称毛利可用', () => {
  const result = buildSalesFinanceSummary({
    salesContract: {
      ...salesContract,
      packingItems: [{
        id: 'packing-no-cost',
        isOwnedByJiesong: true,
        totalPrice: 500,
        purchaseCost: null,
        quantity: 2,
      }],
      payments: [],
      taxRefunds: [],
    },
    purchases: [],
    exportReadiness: { lines: [] },
  });

  assert.equal(result.marginReady, false);
  assert.equal(result.cost.purchaseCostCny, 0);
  assert.ok(result.issues.some((issue) => issue.code === 'MISSING_PURCHASE_COST' && issue.severity === 'error'));
});

test('buildSalesFinanceSummary: 无付款流水的历史合同保留已收金额但明确标记来源', () => {
  const result = buildSalesFinanceSummary({
    salesContract: {
      ...salesContract,
      totalAmount: 600,
      receivedAmount: 300,
      packingItems: [salesContract.packingItems[0]],
      payments: [],
      taxRefunds: [],
    },
    purchases,
    exportReadiness,
  });

  assert.equal(result.revenue.receivedUsd, 300);
  assert.equal(result.revenue.receivedSource, 'legacy_contract_balance');
  assert.ok(result.issues.some((issue) => issue.code === 'LEGACY_RECEIPT_BALANCE'));
});

test('buildSalesFinanceSummary: 非美元销售收款不进入美元已收且形成硬阻塞', () => {
  const result = buildSalesFinanceSummary({
    salesContract: {
      ...salesContract,
      packingItems: [salesContract.packingItems[0]],
      payments: [{
        id: 'receipt-cny',
        type: 'RECEIVABLE',
        currency: 'CNY',
        amount: 700,
        paymentDate: new Date('2026-07-02T00:00:00.000Z'),
      }],
    },
    purchases,
    exportReadiness,
  });

  assert.equal(result.cashReady, false);
  assert.equal(result.revenue.receivedUsd, 0);
  assert.ok(result.issues.some((issue) => issue.code === 'UNSUPPORTED_RECEIPT_CURRENCY'));
});
