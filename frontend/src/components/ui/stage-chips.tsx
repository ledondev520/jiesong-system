/**
 * Input: 阶段列表（key/label/count）、当前选中 key、选择回调、加载状态
 * Output: 横向阶段筛选 chips，带计数；加载或失败时计数显示「—」而不是 0
 * Pos: 通用 UI 组件，Workbench 与列表页的阶段筛选（PHASE3 §1 archetype C）
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { MISSING_VALUE, isMissing } from "@/lib/missing-value";
import { cn } from "@/lib/utils";

export interface StageChip {
  key: string;
  label: string;
  /** null/undefined（未加载或失败）显示「—」 */
  count?: number | null;
}

interface StageChipsProps {
  stages: readonly StageChip[];
  value: string;
  onChange: (key: string) => void;
  loading?: boolean;
  /** 后端没有各阶段计数时传 false，不显示「—」占位。 */
  showCount?: boolean;
  ariaLabel?: string;
  className?: string;
}

export function StageChips({
  stages,
  value,
  onChange,
  loading = false,
  showCount = true,
  ariaLabel = "阶段筛选",
  className,
}: StageChipsProps) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn("flex flex-wrap gap-2", className)}
    >
      {stages.map((stage) => {
        const active = stage.key === value;
        return (
          <button
            key={stage.key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(stage.key)}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {stage.label}
            {showCount && (
              <span className="tabular-nums">
                {loading || isMissing(stage.count)
                  ? MISSING_VALUE
                  : stage.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
