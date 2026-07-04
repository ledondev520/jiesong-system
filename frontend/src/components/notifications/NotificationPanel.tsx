/**
 * Input: 通知列表数据
 * Output: 通知列表面板（下拉/弹窗内容）
 * Pos: 通知展示子组件
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useRouter } from 'next/navigation';
import { FileText, Ship, TrendingUp, AlertTriangle, Check, CheckCheck, Loader2, ReceiptText, Landmark } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Notification, NotificationType } from '@/types';

const typeIconMap: Record<NotificationType, typeof FileText> = {
  PURCHASE_DRAFT: FileText,
  SALES_DRAFT: Ship,
  OVERDUE_RECEIVABLE: TrendingUp,
  LOW_STOCK: AlertTriangle,
  TAX_REFUND_MONTHLY: Landmark,
  INVOICE_MISSING: ReceiptText,
};

const typeColorMap: Record<NotificationType, string> = {
  PURCHASE_DRAFT: 'bg-blue-500/10 text-blue-600',
  SALES_DRAFT: 'bg-amber-500/10 text-amber-600',
  OVERDUE_RECEIVABLE: 'bg-rose-500/10 text-rose-600',
  LOW_STOCK: 'bg-orange-500/10 text-orange-600',
  TAX_REFUND_MONTHLY: 'bg-emerald-500/10 text-emerald-600',
  INVOICE_MISSING: 'bg-violet-500/10 text-violet-600',
};

interface NotificationPanelProps {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onNavigate?: (href: string) => void;
}

export function NotificationPanel({
  notifications,
  unreadCount,
  loading,
  onMarkRead,
  onMarkAllRead,
  onNavigate,
}: NotificationPanelProps) {
  const router = useRouter();

  const handleClick = (n: Notification) => {
    if (!n.isRead) {
      onMarkRead(n.id);
    }
    if (n.link) {
      if (onNavigate) {
        onNavigate(n.link);
      } else {
        router.push(n.link);
      }
    }
  };

  return (
    <div className="w-80">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-sm font-semibold">通知</span>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Badge variant="secondary" className="text-[11px]">
              {unreadCount} 条未读
            </Badge>
          )}
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                onMarkAllRead();
              }}
            >
              <CheckCheck className="mr-1 h-3.5 w-3.5" />
              全部已读
            </Button>
          )}
        </div>
      </div>
      <div className="border-t" />

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center py-8 text-center">
          <Check className="mb-2 h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium text-foreground">暂无通知</p>
          <p className="text-xs text-muted-foreground">所有事项都已处理完毕</p>
        </div>
      ) : (
        <div className="max-h-[320px] overflow-y-auto py-1">
          {notifications.map((n) => {
            const Icon = typeIconMap[n.type] || FileText;
            return (
              <button
                key={n.id}
                className={cn(
                  'flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent',
                  !n.isRead && 'bg-accent/40',
                )}
                onClick={() => handleClick(n)}
              >
                <span
                  className={cn(
                    'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                    typeColorMap[n.type] || 'bg-muted text-muted-foreground',
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{n.title}</p>
                    {!n.isRead && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                    )}
                  </div>
                  {n.content && (
                    <p className="text-xs text-muted-foreground truncate">{n.content}</p>
                  )}
                  <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                    {new Date(n.createdAt).toLocaleString('zh-CN', {
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
