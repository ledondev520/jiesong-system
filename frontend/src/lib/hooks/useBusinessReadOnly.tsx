'use client';
import type { ReactNode } from 'react';
import { Role } from '@/types';
import { useAuthStore } from '@/store/auth.store';

export const useBusinessReadOnly = () => useAuthStore((state) => state).user?.role === Role.BOSS;

/** 在具体业务写动作处使用；筛选、翻页及详情不经过这个门禁。 */
export function BusinessWrite({ children }: { children: ReactNode }) {
  return useBusinessReadOnly() ? null : <>{children}</>;
}

export const isBossRestrictedPath = (pathname: string) => (
  /\/(create|edit)(\/|$)/.test(pathname)
  || /^\/dashboard\/(ai|settings|users)(\/|$)/.test(pathname)
  || (/^\/dashboard\/system(\/|$)/.test(pathname) && pathname !== '/dashboard/system/notifications')
  || /^\/dashboard\/contracts\/(template|templates)(\/|$)/.test(pathname)
);
