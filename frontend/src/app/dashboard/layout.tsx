/**
 * Input: 认证状态仓库（zustand persist）、路由导航能力、Sidebar、Header、MobileTabBar
 * Output: 验证会话后呈现 Dashboard，未登录重定向与网络失败重试
 * Pos: 仪表盘路由层，承载导航框架和内容区域；移动端使用底部 TabBar 替代侧边栏
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { getAuthToken } from "@/lib/auth-token";
import { getBrowserCsrf } from "@/lib/browser-session";
import { authService } from "@/services/auth.service";
import { Button } from "@/components/ui/button";
import { Role } from "@/types";
import { isBossRestrictedPath } from "@/lib/hooks/useBusinessReadOnly";
import { useAuthStore } from "@/store/auth.store";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { NetworkStatus } from "@/components/ui/network-status";
import {
  getDefaultDashboardHref,
  getModuleByPath,
  getVisibleModuleNavItems,
} from "@/components/layout/navigation.config";

type PersistedAuthState = {
  state?: {
    user?: unknown;
    token?: unknown;
    isAuthenticated?: unknown;
  };
};

const readPersistedAuthState = (): PersistedAuthState | null => {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.sessionStorage.getItem("auth-storage");
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as PersistedAuthState;
  } catch {
    return null;
  }
};

/**
 * 职责：在认证状态完成 hydration 后渲染仪表盘框架，并对未登录用户执行客户端重定向。
 * 思路：
 * 1) 通过本地 `hydrated` 状态保证首屏 SSR/CSR 输出一致，避免 hydration mismatch。
 * 2) hydration 完成后仅根据持久化恢复的认证状态决定是否跳转登录页。
 * 3) 仅在可渲染时输出稳定布局结构。
 * @param children 页面内容插槽
 * @returns 仪表盘布局节点或空节点
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState(false);
  const [retry, setRetry] = useState(0);
  const hydrated = useSyncExternalStore(
    (callback) => {
      const persistApi = useAuthStore.persist;
      if (!persistApi) {
        return () => {};
      }
      return persistApi.onFinishHydration(callback);
    },
    () => useAuthStore.persist?.hasHydrated?.() ?? true,
    () => false,
  );

  useEffect(() => {
    if (!hydrated || !isAuthenticated) return;
    if (getAuthToken() || getBrowserCsrf()) {
      return;
    }
    const controller = new AbortController();
    void authService
      .restoreSession(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        if (result.code !== 200 || !result.data?.user || !result.data.csrfToken)
          throw result;
        useAuthStore
          .getState()
          .login(result.data.user, null, result.data.csrfToken);
        setSessionReady(true);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const code =
          typeof error === "object" && error !== null && "code" in error
            ? Number(error.code)
            : null;
        if (code === 401) {
          useAuthStore.getState().logout();
          router.replace("/login?expired=1");
        } else setSessionError(true);
      });
    return () => controller.abort();
  }, [hydrated, isAuthenticated, retry, router]);

  useEffect(() => {
    // 0. 仅在 hydration 完成后执行客户端跳转，避免 SSR/CSR 分支差异
    if (hydrated && !isAuthenticated) {
      const persisted = readPersistedAuthState();
      const hasPersistedAuth =
        Boolean(persisted?.state?.isAuthenticated) &&
        typeof persisted?.state?.token === "string" &&
        Boolean(persisted?.state?.token) &&
        typeof persisted?.state?.user === "object" &&
        persisted?.state?.user !== null;

      // 持久化状态已存在时，等待 zustand 同步，避免误跳转到登录页。
      if (hasPersistedAuth) {
        return;
      }
      router.replace("/login");
    }
  }, [hydrated, isAuthenticated, router]);

  useEffect(() => {
    if (
      !hydrated ||
      !isAuthenticated ||
      (!sessionReady && !getAuthToken() && !getBrowserCsrf())
    ) {
      return;
    }

    if (pathname === "/dashboard/system/notifications") return;
    const currentModule = getModuleByPath(pathname);
    if (!currentModule) {
      return;
    }

    const visibleKeys = new Set(
      getVisibleModuleNavItems(user?.role).map((item) => item.key),
    );
    if (!visibleKeys.has(currentModule.key)) {
      router.replace(getDefaultDashboardHref(user?.role));
    }
  }, [hydrated, isAuthenticated, pathname, router, sessionReady, user?.role]);

  // 冷启动（页面刷新/直接访问）需要等待 hydration，避免 SSR/CSR 不一致；
  // 登录后客户端跳转时 isAuthenticated 在内存中已为 true，无需等待 hydration。
  if (sessionError) {
    return (
      <div
        role="alert"
        className="flex min-h-screen flex-col items-center justify-center gap-4"
      >
        <p>暂时无法确认登录状态，请检查网络后重试</p>
        <Button
          onClick={() => {
            setSessionError(false);
            setRetry((value) => value + 1);
          }}
        >
          重试
        </Button>
      </div>
    );
  }
  if (
    !isAuthenticated ||
    (!sessionReady && !getAuthToken() && !getBrowserCsrf())
  ) {
    return null;
  }

  const visibleItems = getVisibleModuleNavItems(user?.role);

  return (
    <>
      <NetworkStatus />
      <div className="grid min-h-screen w-full bg-muted/40 md:grid-cols-[260px_1fr]">
        {/* 桌面端侧边栏：移动端隐藏 */}
        <div className="hidden border-r bg-sidebar md:block">
          <Sidebar />
        </div>
        <div className="flex min-w-0 flex-col">
          <Header />
          {/* 移动端底部 TabBar 高度补偿：56px + safe-area-inset-bottom */}
          <main
            className="flex min-w-0 flex-1 flex-col gap-6 px-4 py-5 md:px-6 lg:px-8"
            style={{
              paddingBottom:
                "calc(56px + env(safe-area-inset-bottom) + 1.25rem)",
            }}
          >
            <Breadcrumbs />
            {user?.role === Role.BOSS && isBossRestrictedPath(pathname) ? (
              <div role="alert" className="rounded-md border p-4 text-sm">
                老板角色仅可查看经营和业务信息，该页面包含管理或写入操作。
              </div>
            ) : (
              children
            )}
          </main>
        </div>
        {/* 移动端底部 TabBar：桌面端由 CSS md:hidden 控制不渲染 */}
        <MobileTabBar visibleItems={visibleItems} />
      </div>
    </>
  );
}
