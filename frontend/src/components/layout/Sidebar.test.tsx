/**
 * Input: Sidebar组件
 * Output: Sidebar组件单元测试
 * Pos: 前端布局组件测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Role } from '@/types';
import { Sidebar } from './Sidebar';

const mockLogout = vi.fn();
const mockPrefetch = vi.fn();
const mockPush = vi.fn();
let mockPathname = '/dashboard/contracts';

const mockUser = {
  role: Role.ADMIN,
};

vi.mock('@/store/auth.store', () => ({
  useAuthStore: (selector: (state: { user: typeof mockUser | null; logout: () => void }) => unknown) => selector({
    user: mockUser,
    logout: mockLogout,
  }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({
    prefetch: mockPrefetch,
    push: mockPush,
  }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

describe('Sidebar', () => {
  beforeEach(() => {
    mockLogout.mockReset();
    mockPrefetch.mockReset();
    mockPush.mockReset();
    mockUser.role = Role.ADMIN;
    mockPathname = '/dashboard/contracts';
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    });
  });

  it('渲染导航项并标记当前路由', () => {
    const { getByText } = render(<Sidebar />);

    // 当前路由是 /dashboard/contracts，对应 "采购" 模块
    const current = getByText('采购').closest('a');
    expect(current?.className.includes('bg-background')).toBe(true);
    expect(getByText('销售')).toBeInTheDocument();
    expect(getByText('系统管理')).toBeInTheDocument();
  });

  it('侧边栏不再渲染退出登录按钮', () => {
    const { queryByRole } = render(<Sidebar />);
    expect(queryByRole('button', { name: '退出登录' })).not.toBeInTheDocument();
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('系统管理路由下系统管理菜单激活', () => {
    mockPathname = '/dashboard/settings';
    const { getByText } = render(<Sidebar />);

    const settingLink = getByText('系统管理').closest('a');
    expect(settingLink?.className.includes('bg-background')).toBe(true);
  });

  it('非管理员角色不再显示系统管理入口', () => {
    mockUser.role = Role.SALES;
    mockPathname = '/dashboard/settings';
    const { queryByText } = render(<Sidebar />);
    expect(queryByText('系统管理')).not.toBeInTheDocument();
  });

  it('空闲时预取可见导航路由', () => {
    vi.useFakeTimers();
    render(<Sidebar />);
    vi.runOnlyPendingTimers();

    expect(mockPrefetch).toHaveBeenCalledWith('/dashboard');
    expect(mockPrefetch).toHaveBeenCalledWith('/dashboard/contracts');
    expect(mockPrefetch).toHaveBeenCalledWith('/dashboard/settings');

    vi.useRealTimers();
  });
});
