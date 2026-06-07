/**
 * Input: 列表条目数据（标题、副标题、状态、金额、操作）
 * Output: 移动端列表卡片组件，替代桌面端 Table 行
 * Pos: 移动端通用组件，供财务/合同/采购等列表页使用
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

// ==================== 类型定义 ====================

interface MobileListCardField {
  /** 字段标签 */
  label: string;
  /** 字段值 */
  value: React.ReactNode;
  /** 强调样式：primary（蓝色）、danger（红色）、success（绿色） */
  emphasis?: 'primary' | 'danger' | 'success';
}

interface MobileListCardProps {
  /** 主标题（如合同编号） */
  title: string;
  /** 副标题（如供应商/客户名称），支持字符串或 ReactNode */
  subtitle?: React.ReactNode;
  /** 状态标签 */
  badge?: React.ReactNode;
  /** 列表字段（最多展示 3 个） */
  fields?: MobileListCardField[];
  /** 右侧金额或关键数值（大字显示） */
  amount?: {
    label: string;
    value: string;
    emphasis?: 'primary' | 'danger' | 'success' | 'default';
  };
  /** 点击整张卡片的回调 */
  onClick?: () => void;
  /** 是否显示右侧箭头（有 onClick 时默认显示） */
  showArrow?: boolean;
  /** 底部操作区域 */
  action?: React.ReactNode;
  /** 自定义 className */
  className?: string;
}

// ==================== 样式映射 ====================

const emphasisClasses = {
  primary: 'text-primary',
  danger: 'text-destructive',
  success: 'text-emerald-600 dark:text-emerald-400',
  default: 'text-foreground',
};

// ==================== 主组件 ====================

/**
 * 职责：渲染移动端列表卡片，作为 Table 行的移动端替代
 * 思路：
 *   1. 顶部行：主标题 + 状态标签 + 可选的金额数值
 *   2. 中间行：副标题 + 关键字段（最多 3 个）
 *   3. 底部行：操作按钮（可选）
 *   4. 整张卡片可点击进入详情（有箭头指示）
 */
export function MobileListCard({
  title,
  subtitle,
  badge,
  fields = [],
  amount,
  onClick,
  showArrow,
  action,
  className,
}: MobileListCardProps) {
  const isClickable = Boolean(onClick);
  const displayArrow = showArrow ?? isClickable;

  const Wrapper = isClickable ? 'button' : 'div';

  return (
    <div className={cn('mobile-card overflow-hidden', className)}>
      {/* ---- 主体区域（可点击） ---- */}
      <Wrapper
        className={cn(
          'w-full text-left',
          isClickable && 'cursor-pointer active:opacity-80',
        )}
        onClick={onClick}
        type={isClickable ? 'button' : undefined}
      >
        {/* 顶行：标题 + 状态 + 金额 */}
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold text-foreground">{title}</span>
              {displayArrow && (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
              )}
            </div>
            {subtitle && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>

          {/* 金额区域 */}
          {amount && (
            <div className="shrink-0 text-right">
              <div
                className={cn(
                  'text-base font-bold',
                  emphasisClasses[amount.emphasis ?? 'default'],
                )}
              >
                {amount.value}
              </div>
              <div className="text-[10px] text-muted-foreground">{amount.label}</div>
            </div>
          )}
        </div>

        {/* 状态 Badge */}
        {badge && <div className="mb-2">{badge}</div>}

        {/* 字段列表 */}
        {fields.length > 0 && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {fields.slice(0, 4).map((field, i) => (
              <div key={i} className="flex items-baseline gap-1">
                <span className="shrink-0 text-[10px] text-muted-foreground">{field.label}</span>
                <span
                  className={cn(
                    'truncate text-xs font-medium',
                    field.emphasis ? emphasisClasses[field.emphasis] : 'text-foreground',
                  )}
                >
                  {field.value}
                </span>
              </div>
            ))}
          </div>
        )}
      </Wrapper>

      {/* ---- 操作区域 ---- */}
      {action && (
        <div className="mt-3 border-t border-border/60 pt-3">
          {action}
        </div>
      )}
    </div>
  );
}
