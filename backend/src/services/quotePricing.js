/**
 * Owner pricing rule (locked 2026-10-31), pure and dependency-free:
 *   sellCny = costCny × (1 + markup)      markup 0.3 normal, 0.1 tiles (瓷砖) — markup on cost
 *   fxUsed  = spot − adjustment           adjustment 0.2
 *   USD     = ceil(sellCny / fxUsed) to whole dollars, then ceil to the next multiple of `roundUpTo` (5)
 * e.g. 10000 CNY, spot 6.72: 13000 / 6.52 = 1993.87 → 1994 → 1995; 1996 → 2000; 2000 stays 2000.
 * shortcut: not yet wired into the export readiness/packet services (still the old tiered rule); card J6 switches them and the config shape.
 */
const DECIMALS = 6;
// toFixed guard: 13.000000000000002 must stay 13, not become 14.
const ceilGuarded = (value) => Math.ceil(Number(value.toFixed(DECIMALS)));

/**
 * @returns {number|null} unit price in whole USD (a multiple of roundUpTo), or null when cost is missing/zero (缺成本)
 * @throws on a non-finite or non-positive rate, or an invalid markup/step (no hidden defaults)
 */
function priceUsd({ costCny, markup, spot, adjustment = 0.2, roundUpTo = 5 }) {
  const fxUsed = spot - adjustment;
  if (![spot, adjustment, markup].every(Number.isFinite) || !(fxUsed > 0) || markup < 0) throw new Error('Invalid pricing inputs');
  if (!Number.isInteger(roundUpTo) || roundUpTo < 1) throw new Error('roundUpTo must be a positive whole number');
  if (!Number.isFinite(costCny) || costCny <= 0) return null;
  const wholeUsd = ceilGuarded((costCny * (1 + markup)) / fxUsed);
  return ceilGuarded(wholeUsd / roundUpTo) * roundUpTo;
}

module.exports = { priceUsd };
