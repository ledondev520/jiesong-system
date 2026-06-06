/**
 * Input: 用户状态、导航配置
 * Output: 顶部导航栏组件
 * Pos: 全局 Header，负责装配移动导航、搜索、通知、用户菜单
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Ship } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { getVisibleModuleNavItems } from './navigation.config';
import { HeaderContextPills } from './HeaderContextPills';
import { HeaderMobileNav } from './HeaderMobileNav';
import { HeaderNotifications } from './HeaderNotifications';
import { HeaderSearch } from './HeaderSearch';
import { HeaderUserMenu } from './HeaderUserMenu';

const subscribeNoop = () => () => {};
const headerDateFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  month: '2-digit',
  day: '2-digit',
  weekday: 'short',
});

export function Header() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const updateProfile = useAuthStore((state) => state.updateProfile);
  const pathname = usePathname();
  const mobileNavItems = getVisibleModuleNavItems(user?.role);
  const todayLabel = useSyncExternalStore(
    subscribeNoop,
    () => headerDateFormatter.format(new Date()),
    () => '',
  );

  const initials = (user?.name || user?.username || '用')
    .slice(0, 2)
    .toUpperCase();

  const handleLogout = () => {
    logout();
    window.location.href = '/login';
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-6"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {/* 汉堡菜单：移动端已有底部 TabBar，此处完全隐藏；仅保留 SSR 结构避免 hydration mismatch */}
      <div className="hidden" aria-hidden="true">
        <HeaderMobileNav
          items={mobileNavItems}
          pathname={pathname}
          userName={user?.name}
          username={user?.username}
          onLogout={handleLogout}
        />
      </div>

      {/* 移动端品牌标识（仅移动端展示，桌面端侧边栏已有） */}
      <Link
        href="/dashboard"
        className="flex items-center gap-2 md:hidden"
        aria-label="捷淞系统首页"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Ship className="h-3.5 w-3.5" />
        </span>
        <span className="text-sm font-semibold">捷淞系统</span>
      </Link>

      <div className="flex flex-1 items-center gap-4">
        <div className="lg:hidden">
          <HeaderContextPills todayLabel={todayLabel} />
        </div>

        <HeaderSearch />
      </div>

      <div className="flex items-center gap-2">
        <ThemeToggle />
        <HeaderNotifications />
        {/* 用户菜单：桌面端保留，移动端通过底部TabBar"更多"入口访问 */}
        <HeaderUserMenu
          displayName={user?.name}
          username={user?.username}
          initials={initials}
          avatar={user?.avatar}
          onSaveProfile={updateProfile}
          onLogout={handleLogout}
        />
      </div>
    </header>
  );
}
