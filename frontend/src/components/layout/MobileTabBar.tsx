/**
 * Input: 用户认证状态、路由导航配置、当前路径
 * Output: 移动端TabBar、更多菜单与经服务端确认的逐浏览器退出
 * Pos: 移动端全局导航层，替代桌面端侧边栏，提供拇指可达的5 Tab 快速跳转
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

"use client";

import { getAuthGeneration } from "@/lib/browser-session";
import { authService } from "@/services/auth.service";
import { toast } from "sonner";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, MoreHorizontal, Settings, Ship } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAuthStore } from "@/store/auth.store";
import { Role } from "@/types";
import {
  getModuleTargetHref,
  getPrimaryMobileModuleNavItems,
  getSecondaryMobileModuleNavItems,
  isModuleRouteActive,
  type ModuleNavItem,
} from "./navigation.config";

// ==================== 类型定义 ====================

// ==================== 子组件 ====================

/**
 * 职责：渲染单个底部 Tab 按钮
 */
function TabButton({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 transition-colors",
        "min-h-[56px] touch-manipulation",
        active ? "text-primary" : "text-muted-foreground",
      )}
      aria-current={active ? "page" : undefined}
    >
      <Icon
        className={cn(
          "h-5 w-5 shrink-0 transition-transform",
          active && "scale-110",
        )}
      />
      <span
        className={cn(
          "text-[11px] font-medium leading-none",
          active && "font-semibold",
        )}
      >
        {label}
      </span>
    </button>
  );
}

// ==================== 主组件 ====================

/**
 * 职责：渲染移动端底部固定 TabBar，提供核心模块快速跳转和"更多"二级菜单
 * 思路：
 *   1. 前 4 个 Tab 直接映射到核心模块（经营中台、采购、出口、财务）
 *   2. 第 5 个 Tab"更多"打开底部 Sheet，包含 AI 助手、系统管理、用户信息与退出
 *   3. 活动状态：使用 isModuleRouteActive 精确判断当前模块
 *   4. 点击模块时保留 tab 记忆跳转（getModuleTargetHref）
 *   5. 底部使用 pb-[env(safe-area-inset-bottom)] 适配 iPhone Home Indicator
 */
export function MobileTabBar({
  visibleItems,
}: {
  visibleItems: ModuleNavItem[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const [moreOpen, setMoreOpen] = useState(false);

  // 0. 分离主 Tab 模块和"更多"里的辅助模块，完全复用导航配置的分组语义
  const primaryItems = getPrimaryMobileModuleNavItems(user?.role).filter(
    (item) => visibleItems.some((visible) => visible.key === item.key),
  );
  const moreItems = getSecondaryMobileModuleNavItems(user?.role).filter(
    (item) => visibleItems.some((visible) => visible.key === item.key),
  );

  // 1. 判断"更多"是否有子项处于活动状态（用于高亮"更多"Tab）
  const isMoreActive = moreItems.some((item) =>
    isModuleRouteActive(pathname, item),
  );

  const handleModuleNavigate = (item: ModuleNavItem) => {
    router.push(getModuleTargetHref(item));
  };

  const handleLogout = async () => {
    const generation = getAuthGeneration();
    try {
      await authService.logout();
      if (generation !== getAuthGeneration()) return;
      setMoreOpen(false);
      logout();
      window.location.href = "/login";
    } catch {
      if (generation !== getAuthGeneration()) return;
      toast.error("退出未完成，请检查网络后重试");
    }
  };

  const initials = (user?.name || user?.username || "用")
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      {/* ---- 底部 TabBar ---- */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="主导航"
      >
        {/* 主模块 Tab */}
        {primaryItems.map((item) => {
          const active = isModuleRouteActive(pathname, item);
          return (
            <TabButton
              key={item.key}
              label={item.label}
              icon={item.icon}
              active={active}
              onClick={() => handleModuleNavigate(item)}
            />
          );
        })}

        {/* 更多 Tab */}
        <TabButton
          label="更多"
          icon={MoreHorizontal}
          active={isMoreActive || moreOpen}
          onClick={() => setMoreOpen(true)}
        />
      </nav>

      {/* ---- 更多 Sheet ---- */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl px-0 pb-0"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
        >
          <SheetHeader className="border-b px-5 pb-4 pr-14">
            <SheetTitle asChild>
              <Link
                href="/dashboard"
                className="flex items-center gap-3"
                onClick={() => setMoreOpen(false)}
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                  <Ship className="h-4 w-4" />
                </span>
                <span className="text-sm font-semibold">捷淞国际物流</span>
              </Link>
            </SheetTitle>
          </SheetHeader>

          {/* 辅助模块链接 */}
          {moreItems.length > 0 && (
            <nav className="grid gap-1 px-4 py-3">
              {moreItems.map((item) => {
                const active = isModuleRouteActive(pathname, item);
                return (
                  <button
                    key={item.key}
                    onClick={() => {
                      setMoreOpen(false);
                      handleModuleNavigate(item);
                    }}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-4 py-3.5 text-sm font-medium text-left transition-colors",
                      "min-h-[52px] touch-manipulation",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-foreground hover:bg-muted",
                    )}
                  >
                    <item.icon className="h-5 w-5 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          )}

          {/* 用户信息 + 退出 */}
          <div className="mx-4 mt-1 space-y-2 rounded-xl border bg-muted/40 p-3">
            <div className="flex items-center gap-3 px-1">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
                {initials}
              </span>
              <div>
                <div className="text-sm font-medium">
                  {user?.name || "当前用户"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {user?.role === Role.ADMIN ? "管理员权限" : "标准权限"}
                </div>
              </div>
            </div>
            {user?.role === Role.ADMIN && (
              <Button
                variant="ghost"
                className="h-11 w-full justify-start gap-3 rounded-lg text-muted-foreground"
                onClick={() => {
                  setMoreOpen(false);
                  router.push("/dashboard/settings");
                }}
              >
                <Settings className="h-4 w-4" />
                <span>系统设置</span>
              </Button>
            )}
            <Button
              variant="ghost"
              className="h-11 w-full justify-start gap-3 rounded-lg text-destructive/80 hover:bg-destructive/10 hover:text-destructive"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" />
              <span>退出登录</span>
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
