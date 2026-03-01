/**
 * Input: 系统通知 API
 * Output: 通知中心页面（查看通知、标记已读）
 * Pos: 运维中心
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/badge';
import {
  getSystemNotifications,
  markSystemNotificationRead,
  SystemNotificationItem,
} from '@/services/system.service';
import { toast } from 'sonner';

type NotificationFilter = 'all' | 'unread';

const formatDateTime = (value: string) => {
  const time = Date.parse(value);
  if (Number.isNaN(time)) {
    return '-';
  }
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(time));
};

const typeLabelMap: Record<string, string> = {
  SYSTEM: '系统',
  IMPORT: '导入',
  CONTRACT: '合同',
  PAYMENT: '财务',
};

const getTypeLabel = (type: string) => typeLabelMap[type] || type || '-';

export default function SystemNotificationsPage() {
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<SystemNotificationItem[]>([]);
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getSystemNotifications({
        page: 1,
        pageSize: 50,
        unreadOnly: filter === 'unread',
      });
      const items = response.data?.items || [];
      setNotifications(Array.isArray(items) ? items : []);
      setTotal(response.data?.pagination?.total || 0);
      setUnreadCount(response.data?.unreadCount || 0);
    } catch {
      toast.error('加载通知失败');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const filteredNotifications = useMemo(
    () => (filter === 'unread' ? notifications.filter((item) => !item.isRead) : notifications),
    [filter, notifications]
  );

  const handleMarkRead = async (id: string) => {
    setMarkingId(id);
    try {
      await markSystemNotificationRead(id);
      setNotifications((prev) => prev.map((item) => (item.id === id ? { ...item, isRead: true } : item)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
      toast.success('已标记为已读');
    } catch {
      toast.error('标记失败');
    } finally {
      setMarkingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="通知中心"
        description="查看系统通知并管理已读状态"
        backHref="/dashboard"
        backLabel="返回工作台"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={filter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('all')}
            >
              全部通知
            </Button>
            <Button
              variant={filter === 'unread' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('unread')}
            >
              仅未读
            </Button>
            <Button variant="outline" size="sm" onClick={loadNotifications}>
              刷新
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>通知列表</CardTitle>
          <CardDescription>
            共 {total} 条通知，未读 {unreadCount} 条
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="surface-panel overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>时间</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>标题</TableHead>
                  <TableHead>内容</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="w-[140px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">加载中...</TableCell>
                  </TableRow>
                ) : filteredNotifications.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">暂无通知。</TableCell>
                  </TableRow>
                ) : (
                  filteredNotifications.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{formatDateTime(item.createdAt)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{getTypeLabel(item.type)}</Badge>
                      </TableCell>
                      <TableCell>{item.title || '-'}</TableCell>
                      <TableCell className="max-w-[420px] whitespace-pre-wrap break-words text-sm text-muted-foreground">
                        {item.content || '-'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={item.isRead ? 'secondary' : 'default'}>
                          {item.isRead ? '已读' : '未读'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {!item.isRead ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={markingId === item.id}
                            onClick={() => handleMarkRead(item.id)}
                          >
                            <CheckCircle2 className="mr-1 h-4 w-4" />
                            {markingId === item.id ? '处理中...' : '标记已读'}
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
