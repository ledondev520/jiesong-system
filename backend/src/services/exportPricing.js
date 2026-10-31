/**
 * Input: 成本(¥)、分类链、报价配置(config/pricing.json)、现汇
 * Output: 唯一的报价规则实现 priceFor()，以及加价/汇率/实现加价辅助函数
 * Pos: 出口备单与单据生成共用；Node 内不再有第二份公式（UX 规范 §7.2，负责人 2026-10-31 取整决定）
 *
 * 规则：单价(USD) = snapPrice( 成本¥ × (1+加价) ÷ (现汇 + 调整) )：先向上取整到整美元；不足 roundUpTo(默认 5) 就停，
 *       否则取最近的 roundUpTo 倍数（步长 5 时按个位：1、2 舍到 0，3–7 到 5，8、9 进到 10）。负责人终版 2026-10-31 14:33/14:36。
 * 加价取商品分类、其最近祖先分类的 categoryMarkups，否则 defaultMarkup。
 */
const { loadPricingConfig } = require('./pricingConfigService');

// 取整步长的仓库默认值（负责人终版 2026-10-31：整美元后取最近的 5 的倍数）；config/pricing.json 与迁移脚本都用它。
const DEFAULT_ROUND_UP_TO = 5;

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

/** 向上取整到 step 的倍数；toFixed(6) 浮点保护使 19.0000000001 仍为 19 */
const roundUp = (value, step) => Math.ceil(Number((value / step).toFixed(6))) * step;

/**
 * 负责人终版取整（2026-10-31 14:33/14:36）：先向上取整到整美元；小于 step 就停；否则取最近的 step 倍数。
 * step=5 时等价于按个位 1、2→0，3–7→5，8、9→10（整数不会出现 .5 平局）。例：1993.87→1994→1995，1991→1990，1998→2000，5.01→6→5。
 */
const snapPrice = (rawUsd, step) => {
  const whole = roundUp(rawUsd, 1);
  return whole < step ? whole : Math.round(whole / step) * step;
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
    unitPriceUsd: snapPrice(rawUnitPriceUsd, config.roundUpTo),
    rawUnitPriceUsd,
    pricedCny,
    markup,
    effectiveRate: rate,
  };
};

const historicalQuoteAllowed = ({ unitPriceUsd, quantity, effectiveRate, costCny, categoryIds }, config = loadPricingConfig()) => {
  const markup = realizedMarkup(unitPriceUsd, quantity, effectiveRate, costCny);
  if (markup === null) return { allowed: false, markup };
  return { allowed: Math.abs(markup - markupFor(categoryIds, config)) <= PRICE_TOLERANCE + 1e-9, markup };
};

module.exports = {
  DEFAULT_ROUND_UP_TO, PRICE_TOLERANCE, effectiveRateFor, historicalQuoteAllowed, markupFor, priceFor, realizedMarkup, round, roundUp, snapPrice,
};
