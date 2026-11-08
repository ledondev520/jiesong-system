/**
 * Input: 页签定义（key/label/badge）、URL 参数名（默认 ?tab=）、默认页签
 * Output: 以 URL 为准的页签；页签可带计数或红点（该页签里有阻塞项）
 * Pos: 通用 UI 组件，记录页（Record archetype）的 ?tab= 页签（PHASE3 §1）
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

"use client";

import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  replaceBrowserQuery,
  useBrowserQuery,
} from "@/lib/hooks/useBrowserQuery";
import { cn } from "@/lib/utils";

export interface UrlTab {
  key: string;
  label: string;
  /** number = 计数；"dot" = 红点（该页签有阻塞项）；undefined = 无徽标 */
  badge?: number | "dot";
  content: ReactNode;
}

interface UrlTabsProps {
  tabs: readonly UrlTab[];
  /** 缺省或 URL 里是未知值时使用，默认第一个页签 */
  defaultTab?: string;
  /** URL 参数名，默认 tab */
  param?: string;
  /** 页签样式变体：默认 line（底线单行滚动），可选 pill（胶囊） */
  variant?: "line" | "pill";
  className?: string;
}

function TabBadge({ badge, label }: { badge: number | "dot"; label: string }) {
  if (badge === "dot") {
    return (
      <span
        role="img"
        aria-label={`${label}有待处理项`}
        className="h-2 w-2 rounded-full bg-status-red"
      />
    );
  }
  return (
    <span
      className={cn(
        "rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground",
      )}
    >
      {badge}
    </span>
  );
}

export function UrlTabs({
  tabs,
  defaultTab,
  param = "tab",
  variant = "line",
  className,
}: UrlTabsProps) {
  const serverQuery = useSearchParams().toString();
  const query = useBrowserQuery(serverQuery);
  const fallback = defaultTab ?? tabs[0]?.key ?? "";
  const requested = new URLSearchParams(query).get(param);
  const active = tabs.some((t) => t.key === requested) ? requested! : fallback;

  return (
    <Tabs
      value={active}
      // 默认页签不写进 URL，保持地址干净
      onValueChange={(next) =>
        replaceBrowserQuery({ [param]: next === fallback ? undefined : next })
      }
      className={className}
    >
      <TabsList
        variant={variant}
        className={
          variant === "pill" ? "h-auto max-w-full flex-wrap justify-start" : undefined
        }
      >
        {tabs.map((tab) => (
          <TabsTrigger key={tab.key} value={tab.key} variant={variant}>
            {tab.label}
            {tab.badge !== undefined && (
              <TabBadge badge={tab.badge} label={tab.label} />
            )}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => (
        <TabsContent key={tab.key} value={tab.key}>
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
