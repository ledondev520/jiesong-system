/**
 * Input: 可能缺失（null/undefined/NaN）的业务值
 * Output: 统一的缺失显示：未知显示「—」（或「未维护」），绝不显示 0
 * Pos: 展示层共用规则（B45）。0 是真实的数值；加载中另用 LoadingValue/KpiCard loading 骨架，三者互不混用：
 *      加载中 = 骨架；加载完成但没有值 = 「—」/「未维护」；真的为 0 = 0。
 */
export const MISSING_VALUE = "—";
export const UNMAINTAINED = "未维护";

export function isMissing(value: unknown): value is null | undefined {
  return (
    value === null ||
    value === undefined ||
    (typeof value === "number" && Number.isNaN(value))
  );
}

/** 有值则返回原值，缺失则返回占位（默认「—」；需要说明「谁没填」时传 UNMAINTAINED）。 */
export function orMissing<T>(
  value: T | null | undefined,
  placeholder: string = MISSING_VALUE,
): T | string {
  return isMissing(value) ? placeholder : (value as T);
}
