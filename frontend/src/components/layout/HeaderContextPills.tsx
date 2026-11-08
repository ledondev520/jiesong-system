/**
 * Input: 当前日期标签
 * Output: Header 上下文提示块
 * Pos: 前端布局子组件
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

"use client";

import { CalendarDays } from "lucide-react";

interface HeaderContextPillsProps {
  todayLabel: string;
}

export function HeaderContextPills({ todayLabel }: HeaderContextPillsProps) {
  return (
    <div className="hidden h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-md border bg-muted/40 px-3 text-xs text-muted-foreground lg:flex">
      <CalendarDays className="h-3.5 w-3.5" />
      <span suppressHydrationWarning>{todayLabel || "今天"}</span>
    </div>
  );
}
