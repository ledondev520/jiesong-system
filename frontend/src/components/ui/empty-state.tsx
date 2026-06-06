/**
 * Input: 图标、标题、描述、可选操作按钮
 * Output: 空状态展示组件
 * Pos: 全局 UI 组件，用于列表/页面无数据时的统一占位
 */

import React, { ReactNode, ComponentType, isValidElement } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface EmptyStateAction {
  label: string;
  onClick: () => void;
}

interface EmptyStateProps {
  icon?: ReactNode | ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: EmptyStateAction | ReactNode;
  className?: string;
}

function isActionObject(action: EmptyStateAction | ReactNode): action is EmptyStateAction {
  return (
    typeof action === 'object' &&
    action !== null &&
    !isValidElement(action) &&
    !Array.isArray(action) &&
    'label' in action &&
    'onClick' in action
  );
}

function isReactComponent(icon: unknown): icon is ComponentType<{ className?: string }> {
  return (
    icon != null &&
    (typeof icon === 'function' ||
      (typeof icon === 'object' && 'render' in icon))
  );
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 text-center', className)}>
      {icon && (
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground">
          {isValidElement(icon) ? icon : isReactComponent(icon) ? (
            <>{React.createElement(icon, { className: 'h-8 w-8' })}</>
          ) : (
            <>{icon}</>
          )}
        </div>
      )}
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>
      )}
      {action && (
        isActionObject(action) ? (
          <Button className="mt-5 rounded-lg shadow-sm" onClick={action.onClick}>
            {action.label}
          </Button>
        ) : (
          <div className="mt-5">{action}</div>
        )
      )}
    </div>
  );
}
