'use client';

/**
 * Input: 图标、标题、描述、操作按钮（可选）
 * Output: 统一风格的空态卡片，用于列表/表格无数据时的友好提示
 * Pos: 全局公共 UI 组件，供所有业务列表页复用
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import React from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

/**
 * 职责：展示统一风格的空态提示，包含图标、标题、描述和可选操作按钮
 * @param icon        Lucide 图标组件
 * @param title       主标题（必填）
 * @param description 副标题说明（可选）
 * @param action      操作按钮（可选，如「新建」按钮）
 * @param className   额外 className
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-16 px-6 text-center',
        className,
      )}
    >
      {Icon && (
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
          <Icon className="h-8 w-8 text-muted-foreground" />
        </div>
      )}
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="mt-1.5 text-sm text-muted-foreground max-w-xs">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
