/**
 * Input: 采购明细、税率、合同金额与已付金额
 * Output: 唯一含税金额口径与异常诊断测试
 * Pos: 采购创建、详情、付款和合同文档共用金额契约测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateNewLineTotal,
  normalizePurchaseTaxRate,
  summarizePurchaseAmounts,
} = require('./purchaseAmountService');

test('历史税率 100 按 1% 兼容读取，新数据仍写百分数', () => {
  assert.equal(normalizePurchaseTaxRate(100), 1);
  assert.equal(normalizePurchaseTaxRate(13), 13);
  assert.equal(normalizePurchaseTaxRate(0), 0);
});

test('采购金额以 unitPrice 为不含税单价、totalPrice 和合同总额为含税金额', () => {
  const summary = summarizePurchaseAmounts({
    taxRate: 13,
    totalAmount: 1130,
    paidAmount: 300,
    items: [{ quantity: 10, unitPrice: 100, totalPrice: 1130 }],
  });

  assert.equal(summary.taxRate, 13);
  assert.equal(summary.netAmount, 1000);
  assert.equal(summary.taxAmount, 130);
  assert.equal(summary.grossAmount, 1130);
  assert.equal(summary.remainingAmount, 830);
  assert.equal(summary.overpaidAmount, 0);
  assert.deepEqual(summary.issues, []);
  assert.equal(calculateNewLineTotal({ quantity: 10, unitPrice: 100 }, 13), 1130);
});

test('历史合同金额异常只诊断，不静默改写或重复加税', () => {
  const summary = summarizePurchaseAmounts({
    taxRate: 13,
    totalAmount: 1000,
    paidAmount: 1200,
    items: [{ quantity: 10, unitPrice: 100, totalPrice: 1130 }],
  });

  assert.equal(summary.grossAmount, 1000);
  assert.equal(summary.remainingAmount, 0);
  assert.equal(summary.overpaidAmount, 200);
  assert.deepEqual(summary.issues.map((issue) => issue.code), [
    'CONTRACT_LINE_MISMATCH',
    'OVERPAID',
  ]);
});

test('缺少明细含税金额时按不含税单价和税率计算一次', () => {
  const summary = summarizePurchaseAmounts({
    taxRate: 1,
    totalAmount: 101,
    paidAmount: 0,
    items: [{ quantity: 1, unitPrice: 100, totalPrice: 0 }],
  });

  assert.equal(summary.netAmount, 100);
  assert.equal(summary.taxAmount, 1);
  assert.equal(summary.lineGrossAmount, 101);
  assert.deepEqual(summary.issues, []);
});

test('历史合同按整元四舍五入的小差额不误报', () => {
  const summary = summarizePurchaseAmounts({
    taxRate: 13,
    totalAmount: 10826,
    items: [{ quantity: 2, unitPrice: 4790.5, totalPrice: 10826 }],
  });

  assert.equal(summary.lineGrossAmount, 10826);
  assert.deepEqual(summary.issues, []);
});
