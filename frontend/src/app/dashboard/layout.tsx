/**
 * Input: 认证状态、Sidebar、Header
 * Output: Dashboard 全局布局容器
 * Pos: 仪表盘路由层，承载导航框架和内容区域
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useAuthStore } from '@/store/auth.store';
import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  // persist 中间件在某些测试/SSR边界可能不可用，需做安全兜底
  const hasHydrated = useAuthStore.persist?.hasHydrated?.() ?? false;
  // 在少量边界场景下（如刷新瞬间/自动化测试），state 可能短暂未恢复，允许 token 作为临时兜底
  const hasTokenFallback =
    typeof window !== 'undefined' && Boolean(window.localStorage.getItem('token'));

  // Client-side only redirect check
  if (hasHydrated && !isAuthenticated && !hasTokenFallback) {
    redirect('/login');
  }

  if (!hasHydrated) {
    return null; // Prevent hydration mismatch
  }

  return (
    <div className="relative grid min-h-screen w-full overflow-hidden bg-background md:grid-cols-[238px_1fr] lg:grid-cols-[298px_1fr]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_20%,oklch(0.72_0.08_252_/_0.12),transparent_32%),radial-gradient(circle_at_88%_16%,oklch(0.79_0.1_74_/_0.1),transparent_28%)]" />
      <div className="relative hidden border-r border-sidebar-border/80 bg-sidebar/80 backdrop-blur-xl md:block">
        <Sidebar />
      </div>
      <div className="relative flex flex-col">
        <Header />
        <main className="flex flex-1 flex-col gap-4 p-4 md:p-5 lg:gap-6 lg:p-7">
          {children}
        </main>
      </div>
    </div>
  );
}
