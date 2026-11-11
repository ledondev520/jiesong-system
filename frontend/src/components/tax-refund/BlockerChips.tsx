/**
 * Input: 退税材料准备的阻塞文案数组、可选的当前原因筛选
 * Output: 每行一条的阻塞原因 chips（类型 + 计数），原文放在「查看原因」折叠里
 * Pos: 退税工作台待申报清单；分组规则与 BlockerGroups 相同，保证 chips 计数与展开内容一致
 */
import { Badge } from "@/components/ui/badge";
import { BlockerGroups, groupBlockers } from "./BlockerGroups";

/** 一个出口的阻塞原因类型（去重，顺序同 BlockerGroups）。 */
export function blockerReasons(blockers: readonly string[]): string[] {
  return groupBlockers(blockers).map((group) => group.label);
}

export function BlockerChips({ blockers }: { blockers: readonly string[] }) {
  const groups = groupBlockers(blockers);
  return (
    <details className="group text-xs">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-1.5 [&::-webkit-details-marker]:hidden">
        {groups.map((group) => (
          <Badge
            key={group.label}
            variant="outline"
            className="border-status-red/40 bg-status-red-soft text-status-red"
          >
            {group.label} {group.entries.length}
          </Badge>
        ))}
        <span className="text-primary group-open:hidden">查看原因</span>
        <span className="hidden text-primary group-open:inline">收起</span>
      </summary>
      <BlockerGroups
        blockers={blockers}
        className="mt-2 space-y-2 text-xs text-muted-foreground"
      />
    </details>
  );
}
