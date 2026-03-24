/**
 * Input: 页面标题、描述、返回链接
 * Output: 页面头部组件（含返回按钮）
 * Pos: 通用布局组件，提供统一的页面头部样式
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  description?: string;
  backHref?: string;   // 指定返回链接，不指定则使用router.back()
  backLabel?: string;  // 返回按钮文字，默认"返回"
  showBack?: boolean;  // 是否显示返回按钮，顶层页面传 false
  actions?: React.ReactNode; // 右侧操作按钮
}

/**
 * 职责：渲染页面头部
 * 思路：
 *   1. 显示返回按钮（如果有backHref或默认使用router.back）
 *   2. 显示标题和描述
 *   3. 显示右侧操作按钮
 */
export function PageHeader({ 
  title, 
  description, 
  backHref, 
  backLabel = '返回',
  showBack,
  actions 
}: PageHeaderProps) {
  // 0. 若未显式传入 showBack，则有 backHref 时才显示返回按钮
  const shouldShowBack = showBack !== undefined ? showBack : Boolean(backHref);
  const router = useRouter();

  const handleBack = () => {
    if (backHref) {
      router.push(backHref);
    } else {
      router.back();
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 md:items-start md:gap-4 md:pb-4">
      <div className="flex min-w-0 items-center gap-2 md:items-start md:gap-3">
        {/* 返回按钮：有 backHref 时自动显示；可通过 showBack 强制控制 */}
        {shouldShowBack && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleBack}
            className="h-9 shrink-0 gap-1 md:mt-0.5"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">{backLabel}</span>
          </Button>
        )}

        {/* 标题区域：移动端字号缩小以节省空间 */}
        <div className="min-w-0">
          <h2 className="break-words text-xl font-semibold tracking-tight md:text-2xl">{title}</h2>
          {/* 描述文字：移动端隐藏，节省屏幕高度 */}
          {description && (
            <p className="hidden break-words text-sm text-muted-foreground md:block">{description}</p>
          )}
        </div>
      </div>

      {/* 右侧操作按钮 */}
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}
