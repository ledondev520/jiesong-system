/**
 * Input: 用户状态、导航配置
 * Output: 顶部导航栏及等待服务端确认、按认证代次保护的逐浏览器退出
 * Pos: 全局 Header，移动端使用紧凑搜索入口，负责装配导航、通知、用户菜单
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

"use client";

import { getAuthGeneration } from "@/lib/browser-session";
import { authService } from "@/services/auth.service";
import { toast } from "sonner";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { Bot, Ship } from "lucide-react";
import { Role } from "@/types";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/auth.store";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Breadcrumbs } from "./Breadcrumbs";
import { HeaderContextPills } from "./HeaderContextPills";
import { HeaderNotifications } from "./HeaderNotifications";
import { HeaderSearch } from "./HeaderSearch";
import { HeaderUserMenu } from "./HeaderUserMenu";

const subscribeNoop = () => () => {};
const headerDateFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
});

export function Header() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const updateProfile = useAuthStore((state) => state.updateProfile);
  const todayLabel = useSyncExternalStore(
    subscribeNoop,
    () => headerDateFormatter.format(new Date()),
    () => "",
  );

  const initials = (user?.name || user?.username || "用")
    .slice(0, 2)
    .toUpperCase();

  const handleLogout = async () => {
    const generation = getAuthGeneration();
    try {
      await authService.logout();
      if (generation !== getAuthGeneration()) return;
      logout();
      window.location.href = "/login";
    } catch {
      if (generation !== getAuthGeneration()) return;
      toast.error("退出未完成，请检查网络后重试");
    }
  };

  return (
    <header
      className="sticky top-0 z-30 flex min-h-16 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:gap-4 md:px-6"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        height: "calc(4rem + env(safe-area-inset-top))",
      }}
    >
      {/* 移动端品牌标识（仅移动端展示，桌面端侧边栏已有） */}
      <Link
        href="/dashboard"
        className="flex min-w-0 flex-1 items-center gap-2 md:hidden"
        aria-label="捷淞国际物流首页"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Ship className="h-3.5 w-3.5" />
        </span>
        <span className="truncate text-sm font-semibold">捷淞国际物流</span>
      </Link>

      {/* 桌面端：面包屑 + 当前页标题（一行） */}
      <div className="hidden min-w-0 flex-1 md:block">
        <Breadcrumbs />
      </div>

      <div className="flex min-w-0 shrink items-center gap-4">
        <div className="hidden xl:block">
          <HeaderContextPills todayLabel={todayLabel} />
        </div>

        <HeaderSearch />
      </div>

      <div className="flex shrink-0 items-center gap-1 md:gap-2">
        <ThemeToggle />
        <HeaderNotifications />
        {/* AI 助手入口：BOSS 无权限；侧栏面板上线后改为切换面板 */}
        {user?.role !== Role.BOSS && (
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="hidden md:inline-flex"
            aria-label="AI 助手"
          >
            <Link href="/dashboard/ai">
              <Bot className="h-4 w-4" />
            </Link>
          </Button>
        )}
        {/* 用户菜单：桌面端保留，移动端通过底部TabBar"更多"入口访问 */}
        <HeaderUserMenu
          displayName={user?.name}
          username={user?.username}
          initials={initials}
          avatar={user?.avatar}
          lastLoginAt={user?.lastLoginAt}
          onSaveProfile={updateProfile}
          onLogout={handleLogout}
        />
      </div>
    </header>
  );
}
