/**
 * Input: 模块导航配置、当前用户、退出动作
 * Output: Header 移动端导航抽屉
 * Pos: 前端布局子组件
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { LogOut, Menu, Ship } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import {
  getModuleTargetHref,
  isModuleRouteActive,
  type ModuleNavItem,
} from './navigation.config';

interface HeaderMobileNavProps {
  items: ModuleNavItem[];
  pathname: string;
  userName?: string;
  username?: string;
  onLogout: () => void;
}

export function HeaderMobileNav({
  items,
  pathname,
  userName,
  username,
  onLogout,
}: HeaderMobileNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 md:hidden"
          aria-label="打开导航菜单"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="flex w-72 flex-col p-0">
        <SheetHeader className="flex h-16 shrink-0 items-center border-b px-5 py-0">
          <SheetTitle asChild>
            <Link
              href="/dashboard"
              className="flex items-center gap-3 font-semibold tracking-tight"
              onClick={() => setOpen(false)}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                <Ship className="h-4 w-4" />
              </span>
              <span>捷淞国际物流</span>
            </Link>
          </SheetTitle>
        </SheetHeader>
        {/* 导航列表可滚动，不被底部用户区覆盖 */}
        <nav className="flex-1 overflow-y-auto grid gap-1 px-3 py-4 content-start">
          {items.map((item) => (
            <Link
              key={item.href}
              href={getModuleTargetHref(item)}
              onClick={() => setOpen(false)}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors',
                isModuleRouteActive(pathname, item)
                  ? 'bg-muted text-foreground shadow-sm ring-1 ring-border'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        {/* 底部用户区：随文档流排布，不再 absolute 覆盖导航列表 */}
        <div className="shrink-0 space-y-3 border-t p-4">
          <div className="rounded-lg border bg-muted/50 px-3 py-2">
            <div className="text-sm font-medium">{userName || '当前用户'}</div>
            <div className="text-xs text-muted-foreground">{username}</div>
          </div>
          <Button
            variant="ghost"
            className="h-11 w-full justify-start gap-3 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            <LogOut className="h-4 w-4" />
            <span>退出登录</span>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
