/**
 * Input: 财务报表数值
 * Output: 页面展示所需的金额、百分比和盈亏样式
 * Pos: 财务报表页格式化工具
 */

export function fmtAmount(val: number | null | undefined): string {
  if (val === null || val === undefined) return "—";
  return `¥${val.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtWan(val: number | null | undefined): string {
  if (val === null || val === undefined) return "—";
  const wan = val / 10000;
  return `¥${wan.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}万`;
}

export function fmtPercent(val: number | null | undefined): string {
  if (val === null || val === undefined) return "—";
  return `${(val * 100).toFixed(1)}%`;
}

export function profitColor(val: number | null | undefined): string {
  if (val === null || val === undefined) return "text-muted-foreground";
  return val >= 0 ? "text-status-green" : "text-destructive";
}

export interface StatementsStaleness {
  /** 最新账期，如 2026年7月 */
  latestLabel: string;
  /** 今天所在月份（上海时区），如 2026年11月 */
  currentLabel: string;
  /** 最新账期距当前月份相差的月数 */
  monthsBehind: number;
  /** 滞后 2 个月及以上才算过期；账期通常次月上传，滞后 1 个月属正常 */
  stale: boolean;
}

/** 最新账期相对今天（上海时区）滞后多少个月；没有账期时返回 null。 */
export function getStatementsStaleness(
  periods: ReadonlyArray<{ year: number; month: number }>,
  now: Date = new Date(),
): StatementsStaleness | null {
  if (periods.length === 0) return null;
  const latest = periods.reduce((best, period) =>
    period.year * 12 + period.month > best.year * 12 + best.month
      ? period
      : best,
  );
  const today = new Date(now.getTime() + 8 * 3600000);
  const currentYear = today.getUTCFullYear();
  const currentMonth = today.getUTCMonth() + 1;
  const monthsBehind = Math.max(
    0,
    currentYear * 12 + currentMonth - (latest.year * 12 + latest.month),
  );
  return {
    latestLabel: `${latest.year}年${latest.month}月`,
    currentLabel: `${currentYear}年${currentMonth}月`,
    monthsBehind,
    stale: monthsBehind >= 2,
  };
}
