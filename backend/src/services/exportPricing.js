const { loadPricingConfig } = require('./pricingConfigService');
const REFUNDABLE_TOLERANCE = 0.05;
const targetMarkupFor = (config, refundRate) => config.mode === 'multiplier'
  ? Math.round((config.multiplier - 1) * 1e10) / 1e10
  : refundRate === 0 ? config.noRefundMarkup : config.refundableMarkup;

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const round = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round((toNumber(value) + Number.EPSILON) * factor) / factor;
};

const realizedMarkup = (unitPriceUsd, quantity, effectiveRate, costCny) => (
  costCny > 0 ? (unitPriceUsd * quantity * effectiveRate) / costCny - 1 : null
);

const historicalQuoteAllowed = ({ unitPriceUsd, quantity, effectiveRate, costCny, refundRate }, config = loadPricingConfig()) => {
  const targetMarkup = targetMarkupFor(config, refundRate);
  const markup = realizedMarkup(unitPriceUsd, quantity, effectiveRate, costCny);
  if (markup === null) return { allowed: false, markup };
  if (config.mode === 'tiered' && refundRate === 0) {
    return { allowed: markup >= -1e-9 && markup <= targetMarkup + 1e-9, markup };
  }
  return {
    allowed: Math.abs(markup - targetMarkup) <= REFUNDABLE_TOLERANCE + 1e-9,
    markup,
  };
};

const unitForRoundedTotal = (total, quantity) => {
  const exact = total / quantity;
  for (let precision = 0; precision <= 10; precision += 1) {
    const factor = 10 ** precision;
    const candidates = [
      Math.floor(exact * factor) / factor,
      round(exact, precision),
      Math.ceil(exact * factor) / factor,
    ].sort((a, b) => Math.abs(a - exact) - Math.abs(b - exact));
    const matching = candidates.find((unit) => round(unit * quantity, 1) === round(total, 1));
    if (matching !== undefined) return matching;
  }
  return round(exact, 10);
};

const calculateFormulaPrice = ({ costCny, quantity, effectiveRate, targetMarkup, strictCap }) => {
  const rawTotal = (costCny * (1 + targetMarkup)) / effectiveRate;
  const rawUnit = rawTotal / quantity;
  const integerUnit = Math.max(1, strictCap ? Math.floor(rawUnit) : Math.round(rawUnit));
  const candidates = [{
    unitPriceUsd: integerUnit,
    totalUsd: round(integerUnit * quantity, 4),
    markup: realizedMarkup(integerUnit, quantity, effectiveRate, costCny),
    roundingMethod: 'integer_unit',
  }];
  const nearestFive = Math.round(rawTotal / 5) * 5;
  for (let offset = -10; offset <= 10; offset += 5) {
    const totalUsd = Math.max(5, nearestFive + offset);
    const unitPriceUsd = unitForRoundedTotal(totalUsd, quantity);
    const markup = realizedMarkup(unitPriceUsd, quantity, effectiveRate, costCny);
    if (strictCap && markup > targetMarkup + 1e-9) continue;
    candidates.push({ unitPriceUsd, totalUsd, markup, roundingMethod: 'total_ends_0_or_5' });
  }
  candidates.sort((a, b) => {
    const gap = Math.abs(a.markup - targetMarkup) - Math.abs(b.markup - targetMarkup);
    if (Math.abs(gap) > 1e-12) return gap;
    const integerPenalty = Number(!Number.isInteger(a.unitPriceUsd)) - Number(!Number.isInteger(b.unitPriceUsd));
    if (integerPenalty !== 0) return integerPenalty;
    return Math.abs(a.totalUsd - rawTotal) - Math.abs(b.totalUsd - rawTotal);
  });
  return { ...candidates[0], rawUnitPriceUsd: rawUnit, rawTotalUsd: rawTotal };
};


module.exports = { calculateFormulaPrice, historicalQuoteAllowed, realizedMarkup, targetMarkupFor, round };
