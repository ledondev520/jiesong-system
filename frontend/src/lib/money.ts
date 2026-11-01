/** Mirror of backend/src/utils/money.js: cents, half away from zero, non-finite -> 0. Keep both in sync. */
export const toCents = (value: unknown): number => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return (
    Math.sign(n) * Math.round(Number((Math.abs(n) * 100).toPrecision(15))) + 0
  ); // + 0 turns -0 into 0
};

export const roundMoney = (value: unknown): number => toCents(value) / 100;
