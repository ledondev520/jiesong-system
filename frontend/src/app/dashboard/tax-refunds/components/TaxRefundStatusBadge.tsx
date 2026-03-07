/**
 * Input: 退税状态值
 * Output: 退税状态徽章
 * Pos: 退税管理共享展示组件
 */

'use client';

import { Badge } from '@/components/ui/badge';
import type { TaxRefundStatus } from '@/types';

const statusMap: Record<
  Exclude<TaxRefundStatus, 'ALL'>,
  { label: string; className: string }
> = {
  DRAFT: { label: '草稿', className: 'bg-muted text-muted-foreground' },
  APPLIED: { label: '已申报', className: 'bg-blue-500/10 text-blue-700 dark:text-blue-300' },
  APPROVED: { label: '已批准', className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  REFUNDED: { label: '已退税', className: 'bg-primary/12 text-primary' },
  REJECTED: { label: '已驳回', className: 'bg-destructive/10 text-destructive' },
};

export const taxRefundStatusOptions: Array<{ value: TaxRefundStatus; label: string }> = [
  { value: 'ALL', label: '全部状态' },
  { value: 'DRAFT', label: '草稿' },
  { value: 'APPLIED', label: '已申报' },
  { value: 'APPROVED', label: '已批准' },
  { value: 'REFUNDED', label: '已退税' },
  { value: 'REJECTED', label: '已驳回' },
];

export function TaxRefundStatusBadge({ status }: { status: Exclude<TaxRefundStatus, 'ALL'> | string }) {
  const meta = statusMap[status as Exclude<TaxRefundStatus, 'ALL'>] || statusMap.DRAFT;

  return (
    <Badge variant="outline" className={meta.className}>
      {meta.label}
    </Badge>
  );
}
