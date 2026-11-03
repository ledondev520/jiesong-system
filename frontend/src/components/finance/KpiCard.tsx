/**
 * Input: KPI 数值、标签、趋势方向、货币单位
 * Output: 专业 B 端 KPI 卡片（带同比/环比箭头）
 * Pos: 财务模块通用 KPI 展示组件
 */

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MISSING_VALUE, isMissing } from "@/lib/missing-value";
import { cn } from "@/lib/utils";

interface KpiCardProps {
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
}

export function KpiCard({
  label,
  value,
  loading = false,
  subLabel,
  trend = "neutral",
  trendValue,
  icon,
  className,
  valueClassName,
}: KpiCardProps) {
  const isUp = trend === "up";
  const isDown = trend === "down";

  return (
    <Card
      className={cn(
        "relative overflow-hidden border-border/60 bg-card transition-all duration-200 hover:border-border/80 hover:shadow-sm",
        className,
      )}
    >
      <CardContent className="p-5" aria-busy={loading || undefined}>
        <div className="flex items-start justify-between">
          <div className="space-y-3 flex-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/80">
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
            {!loading && trendValue && (
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
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
              </div>
            )}
          </div>
          {icon && (
            <div className="ml-3 mt-0.5 shrink-0 rounded-lg bg-primary/5 p-2.5 text-primary/70">
              {icon}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
