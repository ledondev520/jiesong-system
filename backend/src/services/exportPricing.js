/**
 * Input: 成本(¥)、分类链、报价配置(config/pricing.json)、现汇
 * Output: 唯一的报价规则实现 priceFor()，以及加价/汇率/实现加价辅助函数
 * Pos: 出口备单与单据生成共用；Node 内不再有第二份公式（UX 规范 §7.2，负责人 2026-10-31 取整决定）
 *
 * 规则（负责人 2026-11-01 00:28 SGT 终版 PRICING-LASTPRICE；按单价取整，从不按行合计取整）：
 *   原始单价(USD) = 成本¥ × (1+加价) ÷ (现汇 + 调整)，向上取整到整美元，不再取 5 的倍数：
 *   0.20→1，6.50→7，13000÷6.52=1993.87→1994
 * 老商品默认取上次确认价（lastConfirmedPrice.js），本文件只负责新商品的成本公式。
 * 加价取商品分类、其最近祖先分类的 categoryMarkups，否则 defaultMarkup。
 */
const { loadPricingConfig } = require('./pricingConfigService');

// 历史报价/人工单价允许偏离目标加价的幅度（百分点/100）。是否保留此闸门待负责人确认（规范 Q5e）。
const PRICE_TOLERANCE = 0.05;

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const round = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round((toNumber(value) + Number.EPSILON) * factor) / factor;
};

/** 单价向上取整到整美元。toFixed(6) 浮点保护使 19.0000000001 仍按 19 处理。 */
const roundUnitPrice = (rawUsd) => Math.ceil(Number(toNumber(rawUsd).toFixed(6)));

/** 现汇 + 调整 = 报价用汇率；现汇缺失/非法时返回 0（调用方据此拒绝报价） */
const effectiveRateFor = (spotRate, config = loadPricingConfig()) => {
  const spot = Number(spotRate);
  return Number.isFinite(spot) && spot > 0 ? round(spot + config.exchangeAdjustment, 6) : 0;
};

/**
 * 订单保存的汇率口径（评审 R1-1）：由报价转换的订单（有 quoteId）保存的是报价用的计价汇率（现汇 − 调整，负责人 2026-10-31
 * 决定，见 DATA-MODEL-2026 §491），其余订单保存现汇。下游定价用本函数取输入，保证调整只做一次。
 */
const orderRateInput = (contract = {}) => (contract?.quoteId
  ? { effectiveRate: Number(contract.exchangeRate) }
  : { spotRate: contract?.exchangeRate });

/** 订单的计价汇率；口径同 orderRateInput。非法时返回 0。 */
const orderEffectiveRate = (contract = {}, config = loadPricingConfig()) => {
  if (!contract?.quoteId) return effectiveRateFor(contract?.exchangeRate, config);
  const rate = Number(contract.exchangeRate);
  return Number.isFinite(rate) && rate > 0 ? round(rate, 6) : 0;
};

/** categoryIds 为从商品分类到最顶层祖先的链（最近的在前）；命中第一个已配置的分类 */
const markupFor = (categoryIds, config = loadPricingConfig()) => {
  const byId = new Map(config.categoryMarkups.map((entry) => [entry.categoryId, entry.markup]));
  const hit = (Array.isArray(categoryIds) ? categoryIds : []).find((id) => byId.has(id));
  return hit === undefined ? config.defaultMarkup : byId.get(hit);
};

const realizedMarkup = (unitPriceUsd, quantity, effectiveRate, costCny) => (
  costCny > 0 ? (unitPriceUsd * quantity * effectiveRate) / costCny - 1 : null
);

// 订单整体利润率提示区间（负责人 2026-10-31 14:36 SGT 默认 30%~35%，可调整）；端点本身不提示
const ORDER_MARGIN_BAND = { min: 0.3, max: 0.35 };

/**
 * 订单整体利润率（只提示，不阻止保存）。口径沿用 realizedMarkup（实际加价，即 profitRate 1.3 = 30%）：
 *   Σ(售价USD × 数量) × 报价汇率(现汇 + 调整) ÷ Σ(成本¥ × 数量) − 1
 * 命中 categoryMarkups 的分类加价行（瓷砖 ×1.1）不参与区间检查；只有这类行、或售价/成本合计为 0 时不提示。
 * @param {{ lines: { costCny: number, quantity: number, unitPriceUsd: number, categoryIds?: string[] }[], spotRate?: number }} input
 */
const orderMargin = ({ lines = [], spotRate } = {}, config = loadPricingConfig()) => {
  const rate = effectiveRateFor(spotRate === undefined ? config.exchangeRate : spotRate, config);
  const categoryPriced = new Set(config.categoryMarkups.map((entry) => entry.categoryId));
  let sellUsd = 0;
  let costCny = 0;
  let excludedLines = 0;
  for (const line of lines) {
    if ((line.categoryIds || []).some((id) => categoryPriced.has(id))) {
      excludedLines += 1;
    } else {
      sellUsd += toNumber(line.unitPriceUsd) * toNumber(line.quantity);
      costCny += toNumber(line.costCny) * toNumber(line.quantity);
    }
  }
  const margin = rate > 0 && sellUsd > 0 && costCny > 0 ? round((sellUsd * rate) / costCny - 1, 6) : null;
  const outOfBand = margin !== null && (margin < ORDER_MARGIN_BAND.min || margin > ORDER_MARGIN_BAND.max);
  const percent = (value) => round(value * 100, 2);
  return {
    margin,
    marginPct: margin === null ? null : percent(margin),
    band: { minPct: percent(ORDER_MARGIN_BAND.min), maxPct: percent(ORDER_MARGIN_BAND.max) },
    effectiveRate: rate,
    excludedLines,
    warning: outOfBand
      ? `订单整体利润率 ${percent(margin)}% 不在 ${percent(ORDER_MARGIN_BAND.min)}%~${percent(ORDER_MARGIN_BAND.max)}% 范围内`
      : null,
  };
};

/**
 * 职责：按唯一规则给出建议单价。
 * 返回 status：OK | MISSING_COST（缺成本，不给建议价）| INVALID_RATE（现汇缺失或调整后非正）
 * @param {{ costCny: number, categoryIds?: string[], spotRate?: number, effectiveRate?: number }} input costCny 为单位采购成本(¥)；
 *   spotRate 缺省取配置现汇；已有订单用 orderRateInput(订单) 展开，由报价转换的订单直接给 effectiveRate（不再加调整）
 */
const priceFor = ({ costCny, categoryIds = [], spotRate, effectiveRate } = {}, config = loadPricingConfig()) => {
  const cost = Number(costCny);
  if (costCny === null || costCny === undefined || costCny === '' || !Number.isFinite(cost) || cost <= 0) {
    return { status: 'MISSING_COST', unitPriceUsd: null };
  }
  const given = Number(effectiveRate);
  const rate = effectiveRate !== undefined
    ? (Number.isFinite(given) && given > 0 ? round(given, 6) : 0)
    : effectiveRateFor(spotRate === undefined ? config.exchangeRate : spotRate, config);
  if (!(rate > 0)) return { status: 'INVALID_RATE', unitPriceUsd: null };
  const markup = markupFor(categoryIds, config);
  const pricedCny = cost * (1 + markup);
  const rawUnitPriceUsd = pricedCny / rate;
  return {
    status: 'OK',
    unitPriceUsd: roundUnitPrice(rawUnitPriceUsd),
    rawUnitPriceUsd,
    pricedCny,
    markup,
    effectiveRate: rate,
  };
};

/** 唯一配置的当前汇率/加价快照；各消费方（AI、巡检、系统汇率接口）只从这里读，不再读 SystemConfig 的 exchangeRate/profitRate。 */
const currentRates = (config = loadPricingConfig()) => ({
  spotRate: config.exchangeRate,
  adjustment: config.exchangeAdjustment,
  effectiveRate: effectiveRateFor(config.exchangeRate, config),
  defaultMarkup: config.defaultMarkup,
});

/** 新建订单未显式给汇率时的默认现汇：只取唯一报价配置，不再有 7.0/7.2 等代码内默认。 */
const defaultSpotRate = (config = loadPricingConfig()) => config.exchangeRate;

const historicalQuoteAllowed = ({ unitPriceUsd, quantity, effectiveRate, costCny, categoryIds }, config = loadPricingConfig()) => {
  const markup = realizedMarkup(unitPriceUsd, quantity, effectiveRate, costCny);
  if (markup === null) return { allowed: false, markup };
  return { allowed: Math.abs(markup - markupFor(categoryIds, config)) <= PRICE_TOLERANCE + 1e-9, markup };
};

module.exports = {
  ORDER_MARGIN_BAND, PRICE_TOLERANCE, currentRates, defaultSpotRate, effectiveRateFor, historicalQuoteAllowed, markupFor, orderMargin, priceFor,
  realizedMarkup, round, roundUnitPrice,
  orderEffectiveRate, orderRateInput,
};
