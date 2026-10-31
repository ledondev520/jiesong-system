const test = require('node:test');
const assert = require('node:assert/strict');
const { priceUsd } = require('./quotePricing');

const price = (costCny, markup = 0.3, extra = {}) => priceUsd({ costCny, markup, spot: 6.72, ...extra });

test('owner example: 10000 CNY at spot 6.72 → 1993.87 → 1994 → 1995', () => {
  assert.equal(price(10000), 1995);
});

test('rounds up to the next multiple of 5; exact multiples stay', () => {
  // sell ¥ chosen so sellCny / 6.52 is exactly the target USD (x1.0 markup).
  assert.equal(price(6.52 * 1996, 0), 2000);
  assert.equal(price(6.52 * 2000, 0), 2000);
  assert.equal(price(6.52 * 2001, 0), 2005);
  assert.equal(price(6.52 * 1995, 0), 1995);
});

test('tiles use the 1.1 multiplier; small amounts still end in 0 or 5', () => {
  assert.equal(price(100, 0.1), 20); // 110 / 6.52 = 16.87 → 17 → 20
  assert.equal(price(100), 20); // 130 / 6.52 = 19.94 → 20 → 20
  assert.equal(price(1, 0.3), 5); // 0.2 → 1 → 5
});

test('float noise does not push an exact result up a step', () => {
  // 65.20 × 1.3 / 6.52 = 13.000000000000002 in floating point
  assert.equal(price(65.2), 15);
  assert.equal(price(6.52 * 10, 0), 10); // exactly 10 must not become 15
});

test('missing or non-positive cost has no price (缺成本)', () => {
  for (const cost of [0, -5, NaN, undefined, Infinity]) assert.equal(price(cost), null);
});

test('invalid rates/markups/steps throw, no hidden defaults', () => {
  assert.throws(() => priceUsd({ costCny: 100, markup: 0.3, spot: 0.2 }), /Invalid pricing inputs/);
  assert.throws(() => priceUsd({ costCny: 100, markup: 0.3, spot: NaN }), /Invalid pricing inputs/);
  assert.throws(() => priceUsd({ costCny: 100, markup: -1, spot: 6.72 }), /Invalid pricing inputs/);
  assert.throws(() => price(100, 0.3, { roundUpTo: 0 }), /roundUpTo/);
  assert.throws(() => price(100, 0.3, { roundUpTo: 2.5 }), /roundUpTo/);
});

test('roundUpTo 1 gives plain whole-dollar rounding (previous rule)', () => {
  assert.equal(price(10000, 0.3, { roundUpTo: 1 }), 1994);
});
