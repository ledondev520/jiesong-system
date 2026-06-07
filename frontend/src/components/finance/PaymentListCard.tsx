/**
 * Input: 收付款记录单项
 * Output: 卡片式收付款展示（左侧金额、右侧详情）
 * Pos: 财务模块收付款列表卡片
 */

import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type PaymentDirection = 'IN' | 'OUT' | 'TRANSFER';

interface PaymentListCardProps {
  direction: PaymentDirection;
  amount: number;
  currency?: string;
  date: string;
  counterpart?: string;
  summary?: string;
  txnType?: string;
  onClick?: () => void;
}

const directionConfig = {
  IN: {
    label: '收款',
    icon: ArrowDownLeft,
    colorClass: 'text-emerald-600',
    bgClass: 'bg-emerald-50 dark:bg-emerald-950/20',
    borderClass: 'border-emerald-200 dark:border-emerald-900',
    badgeVariant: 'outline' as const,
    badgeClass: 'text-emerald-600 border-emerald-200',
  },
  OUT: {
    label: '付款',
    icon: ArrowUpRight,
    colorClass: 'text-red-600',
    bgClass: 'bg-red-50 dark:bg-red-950/20',
    borderClass: 'border-red-200 dark:border-red-900',
    badgeVariant: 'outline' as const,
    badgeClass: 'text-red-600 border-red-200',
  },
  TRANSFER: {
    label: '转账',
    icon: ArrowLeftRight,
    colorClass: 'text-blue-600',
    bgClass: 'bg-blue-50 dark:bg-blue-950/20',
    borderClass: 'border-blue-200 dark:border-blue-900',
    badgeVariant: 'outline' as const,
    badgeClass: 'text-blue-600 border-blue-200',
  },
};

export function PaymentListCard({
  direction,
  amount,
  currency = '¥',
  date,
  counterpart,
  summary,
  txnType,
  onClick,
}: PaymentListCardProps) {
  const config = directionConfig[direction];
  const Icon = config.icon;
  const fmt = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div
      onClick={onClick}
      className={cn(
        'flex items-center justify-between rounded-xl border p-4 transition-all duration-200',
        'bg-card hover:shadow-sm hover:border-border/80',
        onClick && 'cursor-pointer',
        config.borderClass
      )}
    >
      <div className="flex items-center gap-4">
        <div
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-lg',
            config.bgClass
          )}
        >
          <Icon className={cn('h-5 w-5', config.colorClass)} />
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              {counterpart || '-'}
            </span>
            <Badge variant={config.badgeVariant} className={cn('text-[10px] h-5', config.badgeClass)}>
              {config.label}
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{date}</span>
            {txnType && <span>· {txnType}</span>}
            {summary && <span className="max-w-[200px] truncate">· {summary}</span>}
          </div>
        </div>
      </div>
      <div className="text-right">
        <p className={cn('text-lg font-bold tabular-nums', config.colorClass)}>
          {direction === 'OUT' ? '-' : '+'}{currency}{fmt.format(Math.abs(amount))}
        </p>
      </div>
    </div>
  );
}
