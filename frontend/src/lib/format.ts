/**
 * Input: 金额/数量数值、币种、加载与错误状态
 * Output: 统一的金额、单价、统计值展示字符串
 * Pos: 展示层格式化（UX 规范 §8.9）；日期仍用 date-format.ts。不做任何取整，只负责显示
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

export type Currency = "CNY" | "USD";

export const EMPTY_VALUE = "—";

const SYMBOL: Record<Currency, string> = { CNY: "¥", USD: "$" };

const toFinite = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
};

const group = (n: number, digits: number) =>
  n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

/**
 * 职责：金额显示，固定 2 位小数 + 明确币种符号（¥ / $）
 * 无效值（null/undefined/NaN/空串）显示「—」，不当作 0
 */
export const formatMoney = (
  value: unknown,
  currency: Currency = "CNY",
): string => {
  const n = toFinite(value);
  if (n === null) return EMPTY_VALUE;
  const sign = n < 0 ? "-" : "";
  return `${sign}${SYMBOL[currency]}${group(Math.abs(n), 2)}`;
};

/**
 * 职责：单价显示；整数单价（报价规则取整后的价格）不带小数，否则 2 位小数
 * 不在此取整：取整口径（整元/整美元）由定价配置决定，这里只按值显示
 */
export const formatUnitPrice = (
  value: unknown,
  currency: Currency = "CNY",
): string => {
  const n = toFinite(value);
  if (n === null) return EMPTY_VALUE;
  if (!Number.isInteger(n)) return formatMoney(n, currency);
  const sign = n < 0 ? "-" : "";
  return `${sign}${SYMBOL[currency]}${group(Math.abs(n), 0)}`;
};

/**
 * 职责：汇总卡片/统计值显示。加载中或出错时返回「—」，绝不显示 0
 */
export const formatStat = (
  value: unknown,
  state: { loading?: boolean; error?: unknown } = {},
  format: (n: number) => string = (n) => group(n, 0),
): string => {
  if (state.loading || state.error) return EMPTY_VALUE;
  const n = toFinite(value);
  return n === null ? EMPTY_VALUE : format(n);
};
