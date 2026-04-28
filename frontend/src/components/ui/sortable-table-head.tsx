/**
 * Input: useTableSort hook 返回的排序状态
 * Output: 可点击排序的表头组件（三态箭头：升序/降序/无）
 * Pos: 通用 UI 组件，配合 useTableSort 使用
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { cn } from '@/lib/utils';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import type { SortDirection } from '@/lib/hooks/useTableSort';

interface SortableTableHeadProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  sortKey: string;
  currentSortKey: string | null;
  currentSortDir: SortDirection;
  onSort: (key: string) => void;
}

/**
 * 职责：可点击排序的表头单元格
 * 思路：包裹 shadcn TableHead 样式，添加排序图标和点击交互
 */
export function SortableTableHead({
  sortKey,
  currentSortKey,
  currentSortDir,
  onSort,
  className,
  children,
  ...props
}: SortableTableHeadProps) {
  const isActive = currentSortKey === sortKey;

  return (
    <th
      data-slot="table-head"
      className={cn(
        'text-muted-foreground h-10 px-4 text-left align-middle text-xs font-medium whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
        'cursor-pointer select-none hover:text-foreground transition-colors',
        isActive && 'text-foreground',
        className
      )}
      onClick={() => onSort(sortKey)}
      {...props}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {isActive && currentSortDir === 'asc' ? (
          <ArrowUp className="h-3 w-3" />
        ) : isActive && currentSortDir === 'desc' ? (
          <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-30" />
        )}
      </span>
    </th>
  );
}
