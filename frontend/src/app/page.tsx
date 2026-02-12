'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';

export default function RootPage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  // persist 在首次加载时需要等待 hydration 完成，否则会出现认证状态闪烁
  const hasHydrated = useAuthStore.persist?.hasHydrated?.() ?? false;

  useEffect(() => {
    // 0. 等待持久化状态恢复后再决定跳转，避免误跳回登录页
    if (!hasHydrated) return;
    // 1. 按认证态路由到 dashboard 或 login
    if (isAuthenticated) {
      router.push('/dashboard');
    } else {
      router.push('/login');
    }
  }, [hasHydrated, isAuthenticated, router]);

  return null;
}
