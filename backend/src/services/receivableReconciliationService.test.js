/**
 * Input: 7月正式合同、美元到账、应收明细和资产负债表样例
 * Output: 重复确认、漏确认与剩余汇率差桥接回归测试
 * Pos: 客户美元应收对账 Module 测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReceivableReconciliation } = require('./receivableReconciliationService');

test('buildReceivableReconciliation: 拆出重复EXP、漏记EXP和剩余折算差', () => {
  const result = buildReceivableReconciliation({
    period: {
      year: 2026,
      month: 7,
      periodLabel: '2026年7账期',
      balanceSheet: { accountsReceivable: 2180207.79 },
    },
    contracts: [
      { contractNo: 'EXP-OLD', totalAmount: 1737980.10, signedAt: new Date('2026-01-01'), shippedAt: new Date('2026-01-01') },
      { contractNo: 'EXP260008', totalAmount: 64314, signedAt: new Date('2026-06-15'), shippedAt: new Date('2026-07-03') },
      { contractNo: 'EXP260009', totalAmount: 27668, signedAt: new Date('2026-06-15'), shippedAt: new Date('2026-07-03') },
    ],
    bankTransactions: [{ amount: 1543799.60, counterpart: 'SP FOOD TRADING LLC' }],
    ledgerEntries: [
      { voucherNumber: '记-1', summary: 'EXP260008 出口应征税', debit: 20529.01, credit: 0 },
      { voucherNumber: '记-2', summary: 'EXP260008 出口应征税', debit: 20529.01, credit: 0 },
      { voucherNumber: '记-3', summary: 'EXP260008 外销收入', debit: 417237.10, credit: 0 },
      { voucherNumber: '记-4', summary: 'EXP260008 外销收入', debit: 417237.10, credit: 0 },
    ],
  });

  assert.equal(result.operatingReceivableUsd, 286162.50);
  assert.equal(result.anomalies.duplicateDebitCny, 437766.11);
  assert.deepEqual(result.anomalies.duplicateContracts, ['EXP260008']);
  assert.equal(result.anomalies.missingContracts[0].contractNo, 'EXP260009');
  assert.equal(result.anomalies.missingDebitCny, 188327.78);
  assert.equal(result.correctedAccountingReceivableCny, 1930769.46);
  assert.equal(result.translatedOperatingReceivableCny, 1947822.32);
  assert.equal(result.residualCny, -17052.86);
});
