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
  backHref?: string;  // 指定返回链接，不指定则使用router.back()
  backLabel?: string; // 返回按钮文字，默认"返回"
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
  actions 
}: PageHeaderProps) {
  const router = useRouter();

  const handleBack = () => {
    if (backHref) {
      router.push(backHref);
    } else {
      router.back();
    }
  };

  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
      <div className="flex min-w-0 items-start gap-3">
        {/* 返回按钮 */}
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleBack}
          className="mt-0.5 gap-1"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Button>
        
        {/* 标题区域 */}
        <div className="min-w-0">
          <h2 className="truncate text-2xl font-semibold tracking-tight">{title}</h2>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      
      {/* 右侧操作按钮 */}
      {actions && (
        <div className="flex flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}
