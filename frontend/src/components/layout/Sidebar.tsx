/**
 * Input: 用户认证状态、路由信息
 * Output: 分组侧边导航栏（首页 / 业务 / 资料 / 设置），激活项展开子页面
 * Pos: 全局布局组件，提供系统导航功能
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 *
 * 菜单结构来自 navigation.config.ts（指向现有 URL，角色可见性同样在该文件配置）；
 * 侧边栏只负责入口与选中态，不拉取业务数据、不显示待办数量徽标。
 */

"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Ship } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  getMenuNavItems,
  isModuleRouteActive,
  isTabRouteActive,
  NAV_GROUP_LABELS,
  type ModuleNavItem,
  type NavGroup,
} from "./navigation.config";

const GROUP_ORDER: NavGroup[] = ["main", "business", "data", "system"];

/**
 * 职责：渲染分组侧边导航栏
 * 思路：
 *   1. 按 group 分段（首页 / 业务 / 资料 / 设置），分段标题来自配置
 *   2. 当前路径属于某项或其 childPrefixes 时高亮；该项有 children 时展开子页面
 *   3. 链接直接使用 defaultHref，由 Next Link 统一处理预取与导航
 */
export function Sidebar() {
  const pathname = usePathname();
  const user = useAuthStore((state) => state.user);

  const items = getMenuNavItems(user?.role);
  const groups = GROUP_ORDER.map((group) => ({
    group,
    items: items.filter((item) => item.group === group),
  })).filter((entry) => entry.items.length > 0);

  const renderItem = (item: ModuleNavItem) => {
    const isActive = isModuleRouteActive(pathname, item);
    return (
      <div key={item.key}>
        <Link
          href={item.defaultHref}
          aria-current={isActive ? "page" : undefined}
          className={cn(
            "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            isActive
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
          )}
        >
          {isActive && (
            <span className="absolute -left-0.5 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
          )}
          <item.icon
            className={cn(
              "h-4 w-4 shrink-0",
              isActive ? "text-primary" : "text-sidebar-foreground/50",
            )}
          />
          <span className="flex-1">{item.label}</span>
        </Link>
        {isActive && item.children.length > 0 && (
          <div className="ml-6 mt-1 grid gap-0.5 border-l border-sidebar-border pl-2">
            {item.children.map((child) => {
              const childActive = isTabRouteActive(pathname, child.href);
              return (
                <Link
                  key={child.href}
                  href={child.href}
                  aria-current={childActive ? "page" : undefined}
                  className={cn(
                    "rounded-md px-2 py-1.5 text-[13px] transition-colors",
                    childActive
                      ? "font-medium text-foreground"
                      : "text-sidebar-foreground/60 hover:text-sidebar-accent-foreground",
                  )}
                >
                  {child.label}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      {/* Logo / 品牌区 */}
      <div className="flex h-16 items-center border-b border-sidebar-border px-5">
        <Link
          href="/dashboard"
          className="flex items-center gap-3 font-semibold tracking-tight transition-opacity hover:opacity-80"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/20">
            <Ship className="h-4 w-4" />
          </span>
          <span>捷淞国际物流</span>
        </Link>
      </div>

      <ScrollArea className="flex-1">
        <nav className="px-3 py-4" aria-label="侧边导航">
          {groups.map(({ group, items: groupItems }) => (
            <div key={group} className="mb-4 last:mb-0">
              {NAV_GROUP_LABELS[group] && (
                <p className="mb-1 px-3 text-xs font-medium text-sidebar-foreground/50">
                  {NAV_GROUP_LABELS[group]}
                </p>
              )}
              <div className="grid gap-1">{groupItems.map(renderItem)}</div>
            </div>
          ))}
        </nav>
      </ScrollArea>

      {/* 底部留白 — 用户操作统一由右上角头像菜单管理 */}
      <div className="border-t border-sidebar-border p-2" />
    </div>
  );
}
