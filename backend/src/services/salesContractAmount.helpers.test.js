const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  computePackingTotals,
  getOutstandingReceivableUsd,
  isSalesContractSettled,
} = require('./salesContractAmount');

const derived = {
  totalAmount: 1000,
  receivedAmount: 100,
  packingItems: [
    { totalPrice: 700, isOwnedByJiesong: true },
    { totalPrice: 300, isOwnedByJiesong: false },
  ],
};

test('computePackingTotals separates owned value', () => {
  assert.deepEqual(computePackingTotals(derived.packingItems), { totalAmount: 1000, ownedTotalAmount: 700 });
  assert.deepEqual(computePackingTotals(undefined), { totalAmount: 0, ownedTotalAmount: 0 });
});

test('outstanding uses owned total, clamps and applies 0.01 tolerance', () => {
  assert.equal(getOutstandingReceivableUsd(derived), 600);
  assert.equal(getOutstandingReceivableUsd({ ...derived, receivedAmount: 900 }), 0);
  assert.equal(getOutstandingReceivableUsd({ ...derived, receivedAmount: 699.99 }), 0);
  assert.equal(getOutstandingReceivableUsd(derived, 650), 50);
  assert.equal(isSalesContractSettled({ ...derived, receivedAmount: 700 }), true);
  assert.equal(isSalesContractSettled(derived), false);
});

// 防止重新出现绕过权威模块的 totalAmount - receivedAmount / paidAmount 手算（导出为已知遗留，见白名单）
const LEGACY = new Set(['exportService.js', 'financeMatchService.js']);
test('services do not subtract receivedAmount/paidAmount from totalAmount', () => {
  const offenders = fs.readdirSync(__dirname)
    .filter((f) => f.endsWith('.js') && !f.endsWith('.test.js') && !LEGACY.has(f))
    .filter((f) => /totalAmount\s*-\s*[\w.]*(receivedAmount|paidAmount)/.test(fs.readFileSync(path.join(__dirname, f), 'utf8')));
  assert.deepEqual(offenders, []);
});
