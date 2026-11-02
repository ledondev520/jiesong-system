"use client";

/**
 * Input: auth store（持久化恢复状态、是否已登录）
 * Output: 已登录访客进入落地页时 router.replace('/dashboard')；未登录什么也不做（落地页本身就是未登录的页面）
 * Pos: 落地页里唯一的客户端逻辑；沿用原根页面的 hydration 等待，避免恢复前误判
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";

export function AuthRedirect() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  // persist 在首次加载时需要等待 hydration 完成，否则会出现认证状态闪烁
  const hasHydrated = useAuthStore.persist?.hasHydrated?.() ?? false;

  useEffect(() => {
    if (hasHydrated && isAuthenticated) router.replace("/dashboard");
  }, [hasHydrated, isAuthenticated, router]);

  return null;
}
