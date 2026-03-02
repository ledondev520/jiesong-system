/**
 * Input: DashboardLayout、认证状态仓库、路由能力
 * Output: dashboard 布局渲染与重定向逻辑测试
 * Pos: 前端路由布局测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardLayout from './layout';

const mocks = vi.hoisted(() => {
  const replace = vi.fn();
  const authState = { isAuthenticated: true };
  let hasHydrated = true;
  let hydrationCallback: (() => void) | null = null;

  const useAuthStore = ((selector: (state: typeof authState) => unknown) => selector(authState)) as {
    (selector: (state: typeof authState) => unknown): unknown;
    persist?: {
      hasHydrated: () => boolean;
      onFinishHydration: (callback: () => void) => () => void;
    };
  };

  useAuthStore.persist = {
    hasHydrated: () => hasHydrated,
    onFinishHydration: (callback: () => void) => {
      hydrationCallback = callback;
      return () => {
        hydrationCallback = null;
      };
    },
  };

  return {
    replace,
    authState,
    useAuthStore,
    setHasHydrated: (value: boolean) => {
      hasHydrated = value;
    },
    getHydrationCallback: () => hydrationCallback,
    resetHydrationCallback: () => {
      hydrationCallback = null;
    },
  };
});

vi.mock('@/store/auth.store', () => ({
  useAuthStore: mocks.useAuthStore,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mocks.replace,
    push: vi.fn(),
    back: vi.fn(),
  }),
}));

vi.mock('@/components/layout/Sidebar', () => ({
  Sidebar: () => <div>SidebarMock</div>,
}));

vi.mock('@/components/layout/Header', () => ({
  Header: () => <div>HeaderMock</div>,
}));

describe('DashboardLayout', () => {
  beforeEach(() => {
    mocks.replace.mockReset();
    mocks.authState.isAuthenticated = true;
    mocks.setHasHydrated(true);
    mocks.resetHydrationCallback();
    sessionStorage.clear();
  });

  it('已登录时渲染布局框架与页面内容', () => {
    render(
      <DashboardLayout>
        <div>页面内容</div>
      </DashboardLayout>,
    );

    expect(screen.getByText('SidebarMock')).toBeInTheDocument();
    expect(screen.getByText('HeaderMock')).toBeInTheDocument();
    expect(screen.getByText('页面内容')).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('未登录且无持久化认证时跳转登录页', async () => {
    mocks.authState.isAuthenticated = false;

    render(
      <DashboardLayout>
        <div>页面内容</div>
      </DashboardLayout>,
    );

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/login');
    });
  });

  it('未登录但存在有效持久化认证时不跳转', async () => {
    mocks.authState.isAuthenticated = false;
    sessionStorage.setItem('auth-storage', JSON.stringify({
      state: {
        isAuthenticated: true,
        token: 'persisted-token',
        user: { id: 'u-1' },
      },
    }));

    render(
      <DashboardLayout>
        <div>页面内容</div>
      </DashboardLayout>,
    );

    await waitFor(() => {
      expect(screen.getByText('页面内容')).toBeInTheDocument();
    });
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('未完成 hydration 时先不渲染，完成后再展示内容', async () => {
    mocks.authState.isAuthenticated = true;
    mocks.setHasHydrated(false);

    const { queryByText } = render(
      <DashboardLayout>
        <div>页面内容</div>
      </DashboardLayout>,
    );

    expect(queryByText('页面内容')).toBeNull();
    expect(typeof mocks.getHydrationCallback()).toBe('function');

    act(() => {
      mocks.getHydrationCallback()?.();
    });

    await waitFor(() => {
      expect(screen.getByText('页面内容')).toBeInTheDocument();
    });
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
