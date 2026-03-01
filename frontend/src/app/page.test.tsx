/**
 * Input: 根路由页面、router、auth store
 * Output: 根路由重定向逻辑测试结果
 * Pos: 前端入口页面测试
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import RootPage from './page';

const mockPush = vi.fn();
const authState = vi.hoisted(() => ({
  isAuthenticated: false,
  hasHydrated: false,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: (...args: unknown[]) => mockPush(...args),
  }),
}));

vi.mock('@/store/auth.store', () => {
  type Selector<T> = (state: { isAuthenticated: boolean }) => T;

  const useAuthStore = ((selector: Selector<unknown>) => {
    return selector({ isAuthenticated: authState.isAuthenticated });
  }) as ((selector: Selector<unknown>) => unknown) & {
    persist: { hasHydrated: () => boolean };
  };

  useAuthStore.persist = {
    hasHydrated: () => authState.hasHydrated,
  };

  return { useAuthStore };
});

describe('RootPage 路由重定向', () => {
  beforeEach(() => {
    mockPush.mockReset();
    authState.isAuthenticated = false;
    authState.hasHydrated = false;
  });

  it('hydration 未完成时不触发跳转', async () => {
    render(<RootPage />);

    await waitFor(() => {
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  it('已登录用户跳转到 dashboard', async () => {
    authState.hasHydrated = true;
    authState.isAuthenticated = true;

    render(<RootPage />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('未登录用户跳转到 login', async () => {
    authState.hasHydrated = true;
    authState.isAuthenticated = false;

    render(<RootPage />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/login');
    });
  });
});
