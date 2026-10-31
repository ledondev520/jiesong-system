/**
 * Input: 成本(¥)、分类链、报价配置(config/pricing.json)、现汇
 * Output: 唯一的报价规则实现 priceFor()，以及加价/汇率/实现加价辅助函数
 * Pos: 出口备单与单据生成共用；Node 内不再有第二份公式（UX 规范 §7.2，负责人 2026-10-31 取整决定）
 *
 * 规则（负责人 2026-10-31 14:33 SGT 终版，14:36 确认；按单价取整，从不按行合计取整）：
 *   原始单价(USD) = 成本¥ × (1+加价) ÷ (现汇 + 调整)
 *   原始单价 < 步长(默认 5)：向上取整到整美元（0.20→1，4.01→5，4.99→5）
 *   原始单价 ≥ 步长：先向上取整到整美元，再按个位取最近的 5 的倍数
 *     （0 不变；1、2 往下到 0；3–7 到 5；8、9 往上到下一个 0）：1993.87→1994→1995，1996→1995，1998→2000，5.01→6→5
 * 步长取配置键 roundUpTo（键名是历史遗留，现在含义是“取整步长”，不是向上取整的上限；负责人锁定为 5）。
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

/**
 * 单价取整（见文件头规则）。toFixed(6) 浮点保护使 19.0000000001 仍按 19 处理。
 * ≥ 步长时的“最近倍数”对整美元无平局（步长 5）；步长为偶数时平局向上。
 */
const roundUnitPrice = (rawUsd, step) => {
  const guarded = Number(toNumber(rawUsd).toFixed(6));
  const whole = Math.ceil(guarded);
  if (guarded < step) return whole;
  return Math.floor(whole / step + 0.5) * step;
};

/** 现汇 + 调整 = 报价用汇率；现汇缺失/非法时返回 0（调用方据此拒绝报价） */
const effectiveRateFor = (spotRate, config = loadPricingConfig()) => {
  const spot = Number(spotRate);
  return Number.isFinite(spot) && spot > 0 ? round(spot + config.exchangeAdjustment, 6) : 0;
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

/**
 * 职责：按唯一规则给出建议单价。
 * 返回 status：OK | MISSING_COST（缺成本，不给建议价）| INVALID_RATE（现汇缺失或调整后非正）
 * @param {{ costCny: number, categoryIds?: string[], spotRate?: number }} input costCny 为单位采购成本(¥)；
 *   spotRate 缺省取配置现汇，已有订单应传该订单保存的现汇
 */
const priceFor = ({ costCny, categoryIds = [], spotRate } = {}, config = loadPricingConfig()) => {
  const cost = Number(costCny);
  if (costCny === null || costCny === undefined || costCny === '' || !Number.isFinite(cost) || cost <= 0) {
    return { status: 'MISSING_COST', unitPriceUsd: null };
  }
  const rate = effectiveRateFor(spotRate === undefined ? config.exchangeRate : spotRate, config);
  if (!(rate > 0)) return { status: 'INVALID_RATE', unitPriceUsd: null };
  const markup = markupFor(categoryIds, config);
  const pricedCny = cost * (1 + markup);
  const rawUnitPriceUsd = pricedCny / rate;
  return {
    status: 'OK',
    unitPriceUsd: roundUnitPrice(rawUnitPriceUsd, config.roundUpTo),
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
  roundUpTo: config.roundUpTo,
});

/** 新建订单未显式给汇率时的默认现汇：只取唯一报价配置，不再有 7.0/7.2 等代码内默认。 */
const defaultSpotRate = (config = loadPricingConfig()) => config.exchangeRate;

const historicalQuoteAllowed = ({ unitPriceUsd, quantity, effectiveRate, costCny, categoryIds }, config = loadPricingConfig()) => {
  const markup = realizedMarkup(unitPriceUsd, quantity, effectiveRate, costCny);
  if (markup === null) return { allowed: false, markup };
  return { allowed: Math.abs(markup - markupFor(categoryIds, config)) <= PRICE_TOLERANCE + 1e-9, markup };
};

module.exports = {
  PRICE_TOLERANCE, currentRates, defaultSpotRate, effectiveRateFor, historicalQuoteAllowed, markupFor, priceFor, realizedMarkup, round, roundUnitPrice,
};
