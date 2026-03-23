/**
 * Input: 当前用户、设置跳转、退出动作
 * Output: Header 用户菜单
 * Pos: 前端布局子组件
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { UserCircle } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface HeaderUserMenuProps {
  displayName?: string;
  username?: string;
  initials: string;
  onOpenSettings: () => void;
  onLogout: () => void;
}

export function HeaderUserMenu({
  displayName,
  username,
  initials,
  onOpenSettings,
  onLogout,
}: HeaderUserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-11 gap-2 rounded-md px-2" aria-label="用户菜单">
          <Avatar className="h-7 w-7 border">
            <AvatarFallback className="text-xs font-medium">{initials}</AvatarFallback>
          </Avatar>
          <div className="hidden text-left sm:block">
            <div className="text-sm font-medium leading-none">{displayName || '管理员'}</div>
            <div className="text-xs text-muted-foreground">{username}</div>
          </div>
          <UserCircle className="hidden h-4 w-4 text-muted-foreground sm:block" />
          <span className="sr-only">用户菜单</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span>{displayName || '管理员'}</span>
            <span className="text-xs font-normal text-muted-foreground">{username}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onOpenSettings}>
          个人设置
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onLogout}>
          退出登录
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
