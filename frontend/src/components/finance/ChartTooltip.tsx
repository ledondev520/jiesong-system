/**
 * Input: Recharts Tooltip payload
 * Output: 精致化 Tooltip（圆角、阴影、背景色）
 * Pos: 财务模块图表通用 Tooltip
 */

import { cn } from '@/lib/utils';

interface ChartTooltipPayloadItem {
  name: string;
  value: number | string;
  color: string;
  unit?: string;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: ChartTooltipPayloadItem[];
  label?: string;
  className?: string;
  valueFormatter?: (value: number | string) => string;
}

export function ChartTooltip({
  active,
  payload,
  label,
  className,
  valueFormatter,
}: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div
      className={cn(
        'rounded-xl border border-border/80 bg-card/95 px-4 py-3 shadow-xl backdrop-blur-sm',
        className
      )}
    >
      {label && (
        <p className="mb-2 text-xs font-semibold text-foreground">{label}</p>
      )}
      <div className="space-y-1.5">
        {payload.map((item, index) => (
          <div key={`${item.name}-${index}`} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-xs font-medium text-muted-foreground">{item.name}</span>
            </div>
            <span className="text-xs font-bold tabular-nums text-foreground">
              {valueFormatter
                ? valueFormatter(item.value)
                : typeof item.value === 'number'
                  ? item.value.toLocaleString('zh-CN')
                  : item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
