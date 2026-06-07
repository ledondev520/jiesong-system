/**
 * Input: 用户认证状态、路由信息
 * Output: 侧边导航栏组件（顶级模块分区）
 * Pos: 全局布局组件，提供系统导航功能
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 *
 * 导航分区结构：
 * - 经营中台：工作台、经营执行
 * - 采购模块：采购合同、供应商管理、库存状态
 * - 出口模块：出口合同、出口退税、HS 编码
 * - 财务模块：财务总览、收付管理
 * - AI 助手：AI 会话
 * - 系统管理：系统配置、用户管理、商品档案、系统日志
 *
 * 侧边栏只负责模块入口与选中态，不拉取业务数据、不显示待办数量徽标。
 */

'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Ship } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
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
 * 职责：渲染侧边导航栏（顶级模块入口）
 * 思路：
 *   1. 侧边栏只显示 6 个模块入口，不列子页面
 *   2. 模块激活判断：当前路径属于该模块任一子路由前缀即高亮
 *   3. 子页面切换由各页面顶部的 ModuleTabHeader 水平 Tab 栏负责
 *   4. 不显示跨模块待办数量，避免导航与业务数据耦合
 *   5. 空闲时预取各模块入口路由
 */
export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
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
        <Link href="/dashboard" className="flex items-center gap-3 font-semibold tracking-tight transition-opacity hover:opacity-80">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/20">
            <Ship className="h-4 w-4" />
          </span>
          <span>捷淞国际物流</span>
        </Link>
      </div>

      {/* 导航区：模块入口 */}
      <ScrollArea className="flex-1">
        <nav className="px-3 py-4">
          <div className="grid gap-1">
            {visibleItems.map((item) => {
              const isActive = isModuleRouteActive(pathname, item);
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
                    'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground',
                  )}
                >
                  {isActive && (
                    <span className="absolute -left-0.5 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
                  )}
                  <span className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors',
                    isActive
                      ? 'bg-primary/15 text-primary'
                      : 'bg-sidebar-accent/40 text-sidebar-foreground/50 group-hover:bg-sidebar-accent/70 group-hover:text-sidebar-foreground/80',
                  )}>
                    <item.icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="flex-1">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </ScrollArea>

      {/* 底部留白 — 用户操作统一由右上角头像菜单管理 */}
      <div className="border-t border-sidebar-border p-2" />
    </div>
  );
}
