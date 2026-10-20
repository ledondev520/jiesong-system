/**
 * Input: 后端通知 API
 * Output: Header 通知下拉与按通知去重的待完成已读操作
 * Pos: 前端布局子组件，重复点击不重复减少未读计数
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { notificationService } from "@/services/notification.service";
import { NotificationPanel } from "@/components/notifications/NotificationPanel";
import type { Notification } from "@/types";

export function HeaderNotifications() {
  const pendingReadIds = useRef(new Set<string>());
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const loadNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const [listRes, countRes] = await Promise.all([
        notificationService.getList({ page: 1, pageSize: 50 }),
        notificationService.getUnreadCount(),
      ]);
      setNotifications(listRes.data?.items || []);
      setUnreadCount(countRes.data?.count || 0);
    } catch {
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  // 首次挂载只读通知列表；生成通知属于写操作，不能放在全局 Header 里拖慢每次页面切换。
  useEffect(() => {
    let active = true;
    const init = () => {
      if (active) {
        void loadNotifications();
      }
    };
    init();
    return () => {
      active = false;
    };
  }, [loadNotifications]);

  const handleMarkRead = async (id: string) => {
    // 同一通知等待完成时只处理一次；其他通知仍可独立标记，失败后可重试。
    if (pendingReadIds.current.has(id)) return;
    pendingReadIds.current.add(id);
    try {
      await notificationService.markRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // 忽略失败
    } finally {
      pendingReadIds.current.delete(id);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationService.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {
      // 忽略失败
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="relative h-11 w-11 rounded-md"
        >
          <Bell className="h-5 w-5" />
          <span className="sr-only">通知</span>
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -right-1 -top-1 h-5 min-w-[20px] px-1.5 text-[11px]"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto p-0">
        <NotificationPanel
          notifications={notifications}
          unreadCount={unreadCount}
          loading={loading}
          onMarkRead={handleMarkRead}
          onMarkAllRead={handleMarkAllRead}
          onNavigate={() => setOpen(false)}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
