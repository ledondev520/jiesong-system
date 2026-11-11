/**
 * Input: 图表坐标轴原始值（CNY 金额、YYYY-MM 月份、数据点数量）
 * Output: 横纵轴刻度文本与旋转参数，保证应用常见宽度下刻度可读
 * Pos: recharts 图表共用的轴格式化（财务概览收支对比、经营分析月度销售趋势）
 */

const trim = (n: number) => String(Number(n.toFixed(1)));

/** 金额刻度：万/亿缩写，避免 7 位以上数字被固定宽度的 Y 轴截断。 */
export const formatCnyAxisTick = (value: number | string): string => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  const abs = Math.abs(n);
  if (abs >= 1e8) return `${trim(n / 1e8)}亿`;
  if (abs >= 1e4) return `${trim(n / 1e4)}万`;
  return String(n);
};

/** 月份刻度："2026-10" → "10月"；首个刻度和 1 月带年份（"2026年1月"），跨年时不会混淆。 */
export const formatMonthAxisTick = (value: string, index: number): string => {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return value;
  const month = Number(match[2]);
  return index === 0 || month === 1 ? `${match[1]}年${month}月` : `${month}月`;
};

/** 点数多于 threshold 时斜排刻度（-35°，右对齐）并留出高度；否则保持水平。 */
export const rotatedTickProps = (count: number, threshold = 8) =>
  count > threshold
    ? { angle: -35, textAnchor: "end" as const, height: 48 }
    : { angle: 0, textAnchor: "middle" as const, height: 30 };
