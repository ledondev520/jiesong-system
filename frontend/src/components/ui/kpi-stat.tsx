/**
 * Input: KPI 标签、数值、加载状态、趋势、可选图标，可选点击（作为筛选）
 * Output: 唯一的 KPI 指标卡：静态边框，无悬浮上浮；加载显示骨架，缺失显示「—」而不是 0；可选 footer（如「查看明细」链接）
 * Pos: 通用 UI 组件，取代 .kpi-card CSS、finance/KpiCard 和页面里零散的 Card+图标块（PHASE3 §1）
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MISSING_VALUE, isMissing } from "@/lib/missing-value";
import { cn } from "@/lib/utils";

interface KpiStatProps {
  label: string;
  /** 缺失（null/undefined）显示「—」，不是 0；加载中请传 loading。 */
  value: string | null | undefined;
  /** 加载中：显示骨架，不显示 0 或「—」（避免把没加载完误读成空系统）。 */
  loading?: boolean;
  subLabel?: string;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  icon?: React.ReactNode;
  className?: string;
  valueClassName?: string;
  /** 数值下方的补充内容（如「查看明细」链接）；不与 onClick 同用，避免按钮里嵌链接。 */
  footer?: React.ReactNode;
  /** 传入后整张卡是一个按钮（用作筛选）；active 表示当前筛选已选中。 */
  onClick?: () => void;
  active?: boolean;
}

export function KpiStat({
  label,
  value,
  loading = false,
  subLabel,
  trend = "neutral",
  trendValue,
  icon,
  className,
  valueClassName,
  footer,
  onClick,
  active = false,
}: KpiStatProps) {
  const isUp = trend === "up";
  const isDown = trend === "down";

  const body = (
    <CardContent className="p-4" aria-busy={loading || undefined}>
      <div className="flex items-start justify-between">
        <div className="flex-1 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            {label}
          </p>
          <div className="space-y-1">
            {loading ? (
              <>
                <div role="status" aria-label="加载中">
                  <Skeleton className="h-8 w-28" />
                </div>
                {subLabel && <Skeleton className="h-3 w-36" />}
              </>
            ) : (
              <>
                <p
                  className={cn(
                    "text-2xl font-bold tabular-nums tracking-tight text-foreground",
                    valueClassName,
                  )}
                >
                  {isMissing(value) ? MISSING_VALUE : value}
                </p>
                {subLabel && (
                  <p className="text-xs text-muted-foreground">{subLabel}</p>
                )}
              </>
            )}
          </div>
          {!loading && footer}
          {!loading && trendValue && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold",
                isUp && "bg-status-green-soft text-status-green",
                isDown && "bg-status-red-soft text-status-red",
                !isUp && !isDown && "bg-muted text-muted-foreground",
              )}
            >
              {isUp && <ArrowUpRight className="h-3 w-3" />}
              {isDown && <ArrowDownRight className="h-3 w-3" />}
              {!isUp && !isDown && <Minus className="h-3 w-3" />}
              {trendValue}
            </span>
          )}
        </div>
        {icon && (
          <div className="ml-3 mt-0.5 shrink-0 rounded-lg bg-primary/5 p-2.5 text-primary/70">
            {icon}
          </div>
        )}
      </div>
    </CardContent>
  );

  if (!onClick) return <Card className={cn("py-0", className)}>{body}</Card>;

  return (
    // 内边距由 CardContent 统一管理，整张卡都可点，且与不可点的卡等高
    <Card
      className={cn(
        "py-0 focus-within:ring-2 focus-within:ring-ring",
        active && "border-primary",
        className,
      )}
    >
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className="w-full rounded-xl text-left outline-none"
      >
        {body}
      </button>
    </Card>
  );
}
