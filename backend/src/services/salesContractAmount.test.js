const test = require('node:test');
const assert = require('node:assert/strict');
const { getEffectiveSalesContractTotal, getEffectiveSalesReceived } = require('./salesContractAmount');

// Same single money rule (half away from zero) as utils/money: 1.005 -> 1.01, not toFixed's 1.00.
test('effective sales total uses roundMoney', () => {
  assert.equal(getEffectiveSalesContractTotal({ totalAmount: 1.005, packingItems: [{ isOwnedByJiesong: true, totalPrice: 0 }] }), 1.01);
});

test('effective sales received uses roundMoney for formal and derived amounts', () => {
  assert.equal(
    getEffectiveSalesReceived({ totalAmount: 2, amountSource: 'FORMAL_DOCUMENT' }, 2, 1.005),
    1.01,
  );
  assert.equal(getEffectiveSalesReceived({ totalAmount: 2 }, 1, 1.005), 0.5);
});
