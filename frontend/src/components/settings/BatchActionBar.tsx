/**
 * Input: 选中数量、操作回调
 * Output: 批量操作浮动工具栏
 * Pos: 设置模块数据表格批量操作
 */

'use client';

import { Button } from '@/components/ui/button';
import { Trash2, Download, X } from 'lucide-react';

interface BatchActionBarProps {
  count: number;
  onDelete: () => void;
  onExport: () => void;
  onClear: () => void;
}

export function BatchActionBar({ count, onDelete, onExport, onClear }: BatchActionBarProps) {
  if (count === 0) return null;

  return (
    <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5 animate-fade-in-up">
      <div className="flex items-center gap-2 text-sm font-medium text-primary">
        <span>已选中 {count} 项</span>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onExport}>
          <Download className="mr-1.5 h-3.5 w-3.5" />
          批量导出
        </Button>
        <Button variant="ghost" size="sm" className="h-8 text-xs text-destructive hover:bg-destructive/10" onClick={onDelete}>
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          批量删除
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClear}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
