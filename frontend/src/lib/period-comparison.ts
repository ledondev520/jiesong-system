/**
 * Input: 本期与上期的数值（上期可能没有账期或没有该项数据）
 * Output: 环比方向与文案；没有上期数据时明确写「无上期数据」，不写「持平」或编造百分比
 * Pos: 财务概览与财务报表的环比徽标共用，避免两页对「没有上期」说法不一
 */

export const NO_PRIOR_PERIOD = "无上期数据";

export interface PeriodComparison {
  dir: "up" | "down" | "neutral";
  text: string;
}

const isNumber = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value);

/**
 * 环比 = (本期 − 上期) / |上期|。
 * 上期缺失 → 「无上期数据」；上期为 0 → 不计算（除以 0 没有意义，也不能说「持平」）。
 */
export function comparePeriods(
  current: number | null | undefined,
  previous: number | null | undefined,
): PeriodComparison {
  if (!isNumber(previous)) return { dir: "neutral", text: NO_PRIOR_PERIOD };
  if (!isNumber(current)) return { dir: "neutral", text: "本期无数据" };
  if (previous === 0) return { dir: "neutral", text: "上期为 0，不计算环比" };
  const diff = ((current - previous) / Math.abs(previous)) * 100;
  if (Math.abs(diff) < 0.1) return { dir: "neutral", text: "环比持平" };
  return {
    dir: diff > 0 ? "up" : "down",
    text: `环比 ${diff > 0 ? "+" : ""}${diff.toFixed(1)}%`,
  };
}
