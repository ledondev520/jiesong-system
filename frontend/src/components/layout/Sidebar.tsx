/**
 * Input: 用户认证状态、路由信息
 * Output: 侧边导航栏组件
 * Pos: 全局布局组件，提供系统导航功能
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 *
 * 导航结构（优化后）：
 * - 核心业务（6 个）：工作台、采购合同、出口合同、库存状态、收付款、采购建议
 * - 财务分析（1 个）：财务报表（三表看板）
 * - AI 功能（1 个）：AI 管理
 * - 合同管理（1 个）：合同模板
 * - 基础设置（1 个）：系统配置/数据导入导出/用户/运维入口
 */

'use client';

import { useEffect, useRef, type ComponentType } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  FileText,
  Ship,
  Warehouse,
  DollarSign,
  Store,
  Bot,
  FileBox,
  Settings,
  LogOut,
  ReceiptText,
  BarChart3,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

type NavChildItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  adminOnly?: boolean;
};

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  exact?: boolean;
  adminOnly?: boolean;
  children?: NavChildItem[];
};

const navItems: NavItem[] = [
  // 核心业务模块
  { href: '/dashboard', label: '工作台', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/contracts', label: '采购合同', icon: FileText, exact: true },
  { href: '/dashboard/sales', label: '出口合同', icon: Ship },
  { href: '/dashboard/tax-refunds', label: '出口退税', icon: ReceiptText },
  { href: '/customs-declarations', label: '报关单', icon: FileText },
  { href: '/dashboard/inventory-container', label: '库存状态', icon: Warehouse },
  { href: '/dashboard/payments', label: '收付款', icon: DollarSign },
  { href: '/dashboard/finance/statements', label: '财务报表', icon: BarChart3 },
  { href: '/dashboard/store-recommend', label: '采购建议', icon: Store },
  
  // AI 功能模块
  { href: '/dashboard/ai/sessions', label: 'AI 管理', icon: Bot },
  
  // 合同管理模块
  { href: '/dashboard/contracts/templates', label: '合同模板', icon: FileBox },
  
  // 基础设置模块
  { href: '/dashboard/settings', label: '基础设置', icon: Settings },
];

const PREFETCH_PRIORITY_ROUTES = [
  '/dashboard',
  '/dashboard/contracts',
  '/dashboard/sales',
  '/dashboard/payments',
  '/dashboard/settings',
] as const;

const MAX_PREFETCH_ROUTES = 6;

/**
 * 职责：渲染侧边导航栏
 * 思路：
 * 1. 过滤管理员专属导航项
 * 2. 根据当前路由高亮激活项
 * 3. 渲染导航链接和退出按钮
 */
export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === 'ADMIN';
  const prefetchedRoutesRef = useRef<Set<string>>(new Set());

  const visibleNavItems = navItems
    .map((item) => ({
      ...item,
      children: item.children?.filter((child) => !child.adminOnly || isAdmin),
    }))
    .filter((item) => {
      if (item.adminOnly && !isAdmin) {
        return false;
      }
      if (item.children) {
        return item.children.length > 0;
      }
      return true;
    });
  const primaryItems = visibleNavItems.filter(
    (item) => item.href !== '/dashboard/settings',
  );
  const managementItems = visibleNavItems.filter(
    (item) => item.href === '/dashboard/settings',
  );
  const prefetchRoutes = visibleNavItems.flatMap((item) => [
    item.href,
    ...(item.children?.map((child) => child.href) ?? []),
  ]);

  useEffect(() => {
    // 空闲时仅预取高优先级路由，避免一次性预取过多页面造成主线程和网络压力。
    const visibleRouteSet = new Set(prefetchRoutes);
    const orderedCandidates = [
      ...PREFETCH_PRIORITY_ROUTES.filter((href) => visibleRouteSet.has(href)),
      ...prefetchRoutes,
    ];
    const uniqueRoutes = Array.from(new Set(orderedCandidates)).slice(0, MAX_PREFETCH_ROUTES);
    const routesToPrefetch = uniqueRoutes.filter((href) => !prefetchedRoutesRef.current.has(href));

    if (routesToPrefetch.length === 0) {
      return;
    }

    const prefetch = () => {
      routesToPrefetch.forEach((href) => {
        router.prefetch(href);
        prefetchedRoutesRef.current.add(href);
      });
    };

    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      const idleId = window.requestIdleCallback(prefetch);
      return () => window.cancelIdleCallback(idleId);
    }

    const timer = setTimeout(prefetch, 300);
    return () => clearTimeout(timer);
  }, [prefetchRoutes, router, pathname]);

  const isActivePath = (href: string, exact?: boolean) => {
    if (exact) {
      return pathname === href;
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const isActiveItem = (item: NavItem) => {
    if (item.children?.some((child) => isActivePath(child.href))) {
      return true;
    }
    if (item.exact) {
      return pathname === item.href;
    }
    return isActivePath(item.href);
  };

  const renderNavItem = (item: NavItem) => (
    <div key={item.href}>
      <Link
        href={item.href}
        className={cn(
          'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
          isActiveItem(item)
            ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
            : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
        )}
      >
        <item.icon className="h-4 w-4" />
        <span className="flex-1">{item.label}</span>
        {item.children ? <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">管理</Badge> : null}
      </Link>

      {item.children && isActiveItem(item) && (
        <div className="ml-4 mt-1 grid gap-1 border-l pl-4">
          {item.children.map((child) => (
            <Link
              key={child.href}
              href={child.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                isActivePath(child.href)
                  ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                  : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )}
            >
              <child.icon className="h-3.5 w-3.5" />
              <span>{child.label}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 items-center border-b border-sidebar-border px-5">
        <Link href="/dashboard" className="flex items-center gap-3 font-semibold tracking-tight">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Ship className="h-4 w-4" />
          </span>
          <div className="grid gap-0.5">
            <span>捷淞系统</span>
            <span className="text-xs font-normal text-muted-foreground">Import & Export</span>
          </div>
        </Link>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-6 px-3 py-4">
          <div className="space-y-2">
            <div className="px-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              核心业务
            </div>
            <nav className="grid gap-1">
              {primaryItems.map(renderNavItem)}
            </nav>
          </div>

          <div className="space-y-2">
            <div className="px-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              系统与配置
            </div>
            <nav className="grid gap-1">
              {managementItems.map(renderNavItem)}
            </nav>
          </div>
        </div>
      </ScrollArea>

      <div className="space-y-3 border-t border-sidebar-border p-4">
        <div className="rounded-lg border bg-background px-3 py-2">
          <div className="text-sm font-medium">{user?.name || '当前用户'}</div>
          <div className="text-xs text-muted-foreground">{isAdmin ? '管理员权限' : '标准权限'}</div>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={() => logout()}
        >
          <LogOut className="h-4 w-4" />
          <span>退出登录</span>
        </Button>
      </div>
    </div>
  );
}
