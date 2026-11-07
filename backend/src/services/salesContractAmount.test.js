const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getEffectiveSalesContractTotal,
  getEffectiveSalesReceived,
  getOutstandingReceivableUsd,
  isSalesContractSettled,
} = require('./salesContractAmount');

// Same single money rule (half away from zero) as utils/money: 1.005 -> 1.01, not toFixed's 1.00.
test('effective sales total uses roundMoney', () => {
  assert.equal(getEffectiveSalesContractTotal({ totalAmount: 1.005, packingItems: [{ isOwnedByJiesong: true, totalPrice: 0 }] }), 1.01);
});

test('effective sales received uses roundMoney for formal and derived amounts', () => {
  assert.equal(
    getEffectiveSalesReceived({ totalAmount: 2, amountSource: 'FORMAL_DOCUMENT' }, 2, 1.005),
    1.01,
  );
  assert.equal(getEffectiveSalesReceived({ totalAmount: 2 }, 1, 1.005), 1);
});

// R2 P0-1: a fully paid mixed (DERIVED) container reads received = owned, outstanding = 0 on every surface.
test('mixed DERIVED container paid in full is settled, with no ratio double-discount', () => {
  const contract = {
    totalAmount: 1000,
    receivedAmount: 600,
    packingItems: [
      { totalPrice: 600, isOwnedByJiesong: true },
      { totalPrice: 400, isOwnedByJiesong: false },
    ],
  };
  assert.equal(getEffectiveSalesReceived(contract), 600);
  assert.equal(getEffectiveSalesReceived(contract, 600, 900), 600);
  assert.equal(getOutstandingReceivableUsd(contract), 0);
  assert.equal(isSalesContractSettled(contract), true);
});
