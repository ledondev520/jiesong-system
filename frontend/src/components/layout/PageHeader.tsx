/**
 * Input: 页面标题、描述、返回链接与可选返回动作
 * Output: 页面头部组件（含可访问返回按钮，手机端完整描述与换行操作）
 * Pos: 通用布局组件，提供统一的页面头部样式
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

interface PageHeaderProps {
  eyebrow?: string; // 标题上方的小引导词，用于标明工作场景
  title: string;
  description?: string;
  backHref?: string; // 默认指定返回链接，不指定则使用router.back()
  onBack?: () => void; // 显式提供时只执行调用方返回动作
  backLabel?: string; // 返回按钮文字，默认"返回"
  showBack?: boolean; // 是否显示返回按钮，顶层页面传 false
  actions?: React.ReactNode; // 右侧操作按钮
}

/**
 * 职责：渲染页面头部
 * 思路：
 *   1. 显示返回按钮，指定动作仅在调用方显式提供时执行
 *   2. 显示标题和描述
 *   3. 显示右侧操作按钮
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  backHref,
  onBack,
  backLabel = "返回",
  showBack,
  actions,
}: PageHeaderProps) {
  // 0. 若未显式传入 showBack，则有 backHref 时才显示返回按钮
  const shouldShowBack = showBack !== undefined ? showBack : Boolean(backHref);
  const router = useRouter();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (backHref) {
      router.push(backHref);
    } else {
      router.back();
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 pb-3 md:items-start md:gap-4 md:pb-4">
      <div className="flex min-w-0 max-w-full items-center gap-2 md:items-start md:gap-3">
        {/* 返回按钮：有 backHref 时自动显示；可通过 showBack 强制控制 */}
        {shouldShowBack && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleBack}
            aria-label={backLabel}
            className="h-9 shrink-0 gap-1 rounded-lg border-border/50 md:mt-0.5"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">{backLabel}</span>
          </Button>
        )}

        {/* 标题区域：移动端字号缩小以节省空间 */}
        <div className="min-w-0">
          {eyebrow && (
            <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {eyebrow}
            </p>
          )}
          <h2 className="break-words text-xl font-semibold tracking-tight md:text-2xl">
            {title}
          </h2>
          {/* 描述可能包含操作提示，手机端同样完整显示 */}
          {description && (
            <p className="mt-1 break-words text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      </div>

      {/* 右侧操作按钮 */}
      {actions && (
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 md:w-auto">
          {actions}
        </div>
      )}
    </div>
  );
}
