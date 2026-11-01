/**
 * Input: 已导入账期列表
 * Output: 「数据截至 X」提示；最新账期滞后 2 个月及以上时明确写出已滞后及其含义
 * Pos: 财务报表页各视图顶部；只说明数据新旧，不改任何数字
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
import { SemanticBadge } from "@/components/ui/status-badge";
import { getStatementsStaleness } from "./financialStatementsFormatting";

export function FinancialStatementsStaleness({
  periods,
  now,
}: {
  periods: ReadonlyArray<{ year: number; month: number }>;
  now?: Date;
}) {
  const staleness = getStatementsStaleness(periods, now);
  if (!staleness) return null;
  return (
    <div
      role="status"
      data-testid="statements-as-of"
      className="flex flex-wrap items-center gap-2 text-sm"
    >
      <SemanticBadge tone={staleness.stale ? "warning" : "neutral"}>
        数据截至 {staleness.latestLabel}
      </SemanticBadge>
      {staleness.stale && (
        <span className="text-muted-foreground">
          当前是 {staleness.currentLabel}，最新账期已滞后{" "}
          {staleness.monthsBehind}{" "}
          个月：之后的账期尚未导入，下面的利润、费用占比和预警都是{" "}
          {staleness.latestLabel} 的数据。
        </span>
      )}
    </div>
  );
}
