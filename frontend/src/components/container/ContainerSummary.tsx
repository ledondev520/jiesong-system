/**
 * Input: 后端装柜计划 LoadingPlan（含 check）
 * Output: 摘要面板：柜数、每柜体积%/毛重%/箱数、80% 检查状态、阻塞项与警告
 * Pos: 货柜页签顶部摘要，文案全部取自后端 check，不在前端重算
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { AlertTriangle, CheckCircle2, CircleDashed } from "lucide-react";
import { SemanticBadge } from "@/components/ui/semantic-badge";
import type { LoadingPlan } from "@/lib/containerLoading";

const STATUS = {
  ready: { label: "可出柜", tone: "success" as const, Icon: CheckCircle2 },
  "under-utilised": {
    label: "未达出柜标准",
    tone: "warning" as const,
    Icon: CircleDashed,
  },
  blocked: { label: "不可出货", tone: "danger" as const, Icon: AlertTriangle },
};

const pct = (value: number) => `${value.toFixed(1)}%`;

export default function ContainerSummary({ plan }: { plan: LoadingPlan }) {
  const { check } = plan;
  const status = STATUS[check.status];
  return (
    <div className="space-y-3" data-testid="container-summary">
      <div className="flex flex-wrap items-center gap-2">
        <status.Icon className="h-4 w-4" aria-hidden />
        <SemanticBadge tone={status.tone}>{status.label}</SemanticBadge>
        <span className="text-sm font-medium">{check.headline}</span>
      </div>
      <div className="text-sm text-muted-foreground">
        {plan.container.label} · 共 {plan.containers.length} 个柜 · 任一利用率 ≥{" "}
        {check.thresholdPct}% 视为达标
      </div>
      {plan.containers.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {plan.containers.map((container) => (
            <li
              key={container.index}
              className="rounded-lg border bg-muted/30 px-3 py-2 text-sm"
            >
              <div className="font-medium">
                第 {container.index + 1} 柜 · {container.cartons} 箱
              </div>
              <div className="text-xs text-muted-foreground tabular-nums">
                体积 {pct(container.volumePct)} · 毛重{" "}
                {pct(container.weightPct)}
              </div>
            </li>
          ))}
        </ul>
      )}
      {[...check.blockers, ...check.warnings].length > 0 && (
        <ul className="space-y-1 text-sm">
          {check.blockers.map((item) => (
            <li
              key={`b-${item.code}-${item.message}`}
              className="text-red-700 dark:text-red-400"
            >
              {item.message}
            </li>
          ))}
          {check.warnings.map((item) => (
            <li
              key={`w-${item.code}-${item.message}`}
              className="text-amber-700 dark:text-amber-400"
            >
              ⚠ {item.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
