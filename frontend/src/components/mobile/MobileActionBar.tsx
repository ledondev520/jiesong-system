/**
 * Input: 主操作按钮配置、次级操作
 * Output: 移动端吸底操作栏组件
 * Pos: 移动端通用组件，用于列表页或详情页的主要操作入口
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// ==================== 类型定义 ====================

interface MobileActionBarProps {
  /** 主操作（右侧突出按钮） */
  primaryAction?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    loading?: boolean;
    icon?: React.ReactNode;
  };
  /** 次级操作（左侧，可以是多个） */
  secondaryActions?: Array<{
    label: string;
    onClick: () => void;
    disabled?: boolean;
    icon?: React.ReactNode;
    variant?: 'outline' | 'ghost';
  }>;
  /** 是否为底部 TabBar 上方留白（默认 true，若页面没有 TabBar 则传 false） */
  aboveTabBar?: boolean;
}

/**
 * 职责：渲染移动端吸底操作栏
 * 思路：
 *   1. fixed 定位在底部，叠加在 TabBar 上方
 *   2. 主操作按钮占多数宽度，次级操作占少数宽度
 *   3. 支持 iOS safe-area-inset-bottom
 */
export function MobileActionBar({
  primaryAction,
  secondaryActions = [],
  aboveTabBar = true,
}: MobileActionBarProps) {
  if (!primaryAction && secondaryActions.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        'mobile-action-bar flex items-center gap-2',
        // 若在 TabBar 上方，需要额外偏移 TabBar 高度
        aboveTabBar ? 'bottom-[calc(56px+env(safe-area-inset-bottom))]' : 'bottom-0',
      )}
      // 覆盖 mobile-action-bar 中的 bottom 定义
      style={
        aboveTabBar
          ? { bottom: 'calc(56px + env(safe-area-inset-bottom))', paddingBottom: '0.75rem' }
          : { paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }
      }
    >
      {/* 次级操作 */}
      {secondaryActions.map((action, i) => (
        <Button
          key={i}
          variant={action.variant ?? 'outline'}
          className="h-11 shrink-0 rounded-xl"
          onClick={action.onClick}
          disabled={action.disabled}
        >
          {action.icon}
          <span>{action.label}</span>
        </Button>
      ))}

      {/* 主操作 */}
      {primaryAction && (
        <Button
          className="h-11 flex-1 rounded-xl text-base font-semibold"
          onClick={primaryAction.onClick}
          disabled={primaryAction.disabled || primaryAction.loading}
        >
          {primaryAction.loading ? (
            <span className="animate-spin">⏳</span>
          ) : (
            primaryAction.icon
          )}
          <span>{primaryAction.label}</span>
        </Button>
      )}
    </div>
  );
}
