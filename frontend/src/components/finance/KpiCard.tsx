/**
 * Input: KPI 数值、标签、趋势方向、货币单位
 * Output: 专业 B 端 KPI 卡片（带同比/环比箭头）
 * Pos: 财务模块通用 KPI 展示组件
 */

import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface KpiCardProps {
  label: string;
  value: string;
  subLabel?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  icon?: React.ReactNode;
  className?: string;
  valueClassName?: string;
}

export function KpiCard({
  label,
  value,
  subLabel,
  trend = 'neutral',
  trendValue,
  icon,
  className,
  valueClassName,
}: KpiCardProps) {
  const isUp = trend === 'up';
  const isDown = trend === 'down';

  return (
    <Card
      className={cn(
        'relative overflow-hidden border-border/60 bg-card transition-all duration-200 hover:border-border/80 hover:shadow-sm',
        className
      )}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-3 flex-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/80">
              {label}
            </p>
            <div className="space-y-1">
              <p
                className={cn(
                  'text-2xl font-bold tabular-nums tracking-tight text-foreground',
                  valueClassName
                )}
              >
                {value}
              </p>
              {subLabel && (
                <p className="text-xs text-muted-foreground">{subLabel}</p>
              )}
            </div>
            {trendValue && (
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold',
                    isUp && 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
                    isDown && 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400',
                    !isUp && !isDown && 'bg-muted text-muted-foreground'
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
