/**
 * Input: any value (number, numeric string, null, NaN)
 * Output: money rounded to cents (half away from zero), non-finite -> 0
 * Pos: the single roundMoney/toCents for backend services (AUDIT-JS-3). Mirror: frontend/src/lib/money.ts.
 * USD price rounding is NOT here: it stays single-sourced in services/exportPricing.js (locked rule).
 */

// toPrecision(15) drops the binary noise (1.005 * 100 = 100.49999999999999) at any magnitude, unlike a fixed epsilon.
// shortcut: exact up to ~1e13 CNY; beyond that, move to integer minor units (docs/money-minor-units-plan.md).
const toCents = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.sign(n) * Math.round(Number((Math.abs(n) * 100).toPrecision(15))) + 0; // + 0 turns -0 into 0
};

const roundMoney = (value) => toCents(value) / 100;

module.exports = { roundMoney, toCents };
