/**
 * Input: 认证状态仓库（zustand persist）、路由导航能力、Sidebar、Header
 * Output: Dashboard 全局布局容器与未登录重定向行为
 * Pos: 仪表盘路由层，承载导航框架和内容区域
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';

type PersistedAuthState = {
  state?: {
    user?: unknown;
    token?: unknown;
    isAuthenticated?: unknown;
  };
};

const readPersistedAuthState = (): PersistedAuthState | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  const raw = window.sessionStorage.getItem('auth-storage');
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
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [hydrated, setHydrated] = useState(() => useAuthStore.persist?.hasHydrated?.() ?? true);

  useEffect(() => {
    // 0. 初始化 hydration 状态，确保首屏结构稳定
    const persistApi = useAuthStore.persist;
    if (!persistApi || persistApi.hasHydrated()) {
      return;
    }
    // 1. 若尚未完成，监听完成事件后更新
    const unsubscribe = persistApi.onFinishHydration(() => {
      setHydrated(true);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    // 0. 仅在 hydration 完成后执行客户端跳转，避免 SSR/CSR 分支差异
    if (hydrated && !isAuthenticated) {
      const persisted = readPersistedAuthState();
      const hasPersistedAuth =
        Boolean(persisted?.state?.isAuthenticated) &&
        typeof persisted?.state?.token === 'string' &&
        Boolean(persisted?.state?.token) &&
        typeof persisted?.state?.user === 'object' &&
        persisted?.state?.user !== null;

      // 持久化状态已存在时，等待 zustand 同步，避免误跳转到登录页。
      if (hasPersistedAuth) {
        return;
      }
      router.replace('/login');
    }
  }, [hydrated, isAuthenticated, router]);

  if (!hydrated) {
    return null; // Prevent hydration mismatch
  }

  return (
    <div className="grid min-h-screen w-full bg-muted/40 md:grid-cols-[260px_1fr]">
      <div className="hidden border-r bg-sidebar md:block">
        <Sidebar />
      </div>
      <div className="flex flex-col">
        <Header />
        <main className="flex flex-1 flex-col gap-6 px-4 py-5 md:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
