/**
 * Input: 通知触发器状态
 * Output: Header 通知下拉
 * Pos: 前端布局子组件
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function HeaderNotifications() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="relative h-11 w-11 rounded-md">
          <Bell className="h-5 w-5" />
          <span className="sr-only">通知</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>消息通知</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="py-6 text-center text-sm text-muted-foreground">
          暂无新通知
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
