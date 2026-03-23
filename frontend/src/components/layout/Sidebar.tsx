/**
 * Input: 用户认证状态、路由信息
 * Output: 侧边导航栏组件（5 大模块分区）
 * Pos: 全局布局组件，提供系统导航功能
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 *
 * 导航分区结构：
 * - 经营中台：工作台、经营执行、库存状态
 * - 采购模块：采购合同、商家管理、采购建议
 * - 出口模块：出口合同、出口退税、报关单、HS 编码
 * - 财务模块：收付款、财务报表
 * - AI 助手：AI 会话管理
 * - 系统管理：合同模板、系统设置
 */

'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Ship, LogOut } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  getModuleTargetHref,
  getVisibleModuleNavItems,
  isModuleRouteActive,
  SHELL_PREFETCH_ROUTES,
} from './navigation.config';

const MAX_PREFETCH_ROUTES = 5;

// ==================== 组件 ====================

/**
 * 职责：渲染侧边导航栏（5 个顶级模块入口）
 * 思路：
 *   1. 侧边栏只显示 5 个模块入口，不列子页面
 *   2. 模块激活判断：当前路径属于该模块任一子路由前缀即高亮
 *   3. 子页面切换由各页面顶部的 ModuleTabHeader 水平 Tab 栏负责
 *   4. 空闲时预取各模块入口路由
 */
export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);
  const prefetchedRoutesRef = useRef<Set<string>>(new Set());

  const visibleItems = getVisibleModuleNavItems(user?.role);

  // 空闲时预取各模块入口路由 + 高频操作页
  useEffect(() => {
    const routesToPrefetch = [
      ...visibleItems.map((i) => i.defaultHref),
      ...SHELL_PREFETCH_ROUTES,
    ]
      .slice(0, MAX_PREFETCH_ROUTES + SHELL_PREFETCH_ROUTES.length)
      .filter((href) => !prefetchedRoutesRef.current.has(href));

    if (routesToPrefetch.length === 0) return;

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
  }, [visibleItems, router, pathname]);

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      {/* Logo / 品牌区 */}
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

      {/* 导航区：5 个模块入口 */}
      <ScrollArea className="flex-1">
        <nav className="grid gap-1 px-3 py-4">
          {visibleItems.map((item) => {
            // 点击模块时，优先跳转到上次记忆的子页面
            const handleModuleClick = (e: React.MouseEvent) => {
              e.preventDefault();
              router.push(getModuleTargetHref(item));
            };

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={handleModuleClick}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors',
                  isModuleRouteActive(pathname, item)
                    ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                    : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </ScrollArea>

      {/* 底部：用户信息 + 退出 */}
      <div className="space-y-3 border-t border-sidebar-border p-4">
        <div className="rounded-lg border bg-background px-3 py-2">
          <div className="text-sm font-medium">{user?.name || '当前用户'}</div>
          <div className="text-xs text-muted-foreground">{user?.role === 'ADMIN' ? '管理员权限' : '标准权限'}</div>
        </div>
        <Button
          variant="ghost"
          className="h-11 w-full justify-start gap-3 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={() => logout()}
        >
          <LogOut className="h-4 w-4" />
          <span>退出登录</span>
        </Button>
      </div>
    </div>
  );
}
