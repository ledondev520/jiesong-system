/**
 * Input: Sidebar组件
 * Output: Sidebar组件单元测试
 * Pos: 前端布局组件测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
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
  default: ({
    href,
    children,
    prefetch,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode; prefetch?: boolean }) => {
    return (
      <a href={href} data-prefetch={prefetch === undefined ? 'auto' : String(prefetch)} {...props}>
        {children}
      </a>
    );
  },
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
    expect(current?.className.includes('bg-sidebar-accent')).toBe(true);
    expect(getByText('出口')).toBeInTheDocument();
    expect(getByText('AI 助手')).toBeInTheDocument();
    expect(getByText('系统管理')).toBeInTheDocument();
  });

  it('不再渲染仓储物流顶层入口', () => {
    const { queryByText } = render(<Sidebar />);

    expect(queryByText('仓储物流')).not.toBeInTheDocument();
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
    expect(settingLink?.className.includes('bg-sidebar-accent')).toBe(true);
  });

  it('AI 助手路由下 AI 助手菜单激活', () => {
    mockPathname = '/dashboard/ai/sessions';
    const { getByText } = render(<Sidebar />);

    const aiLink = getByText('AI 助手').closest('a');
    const adminLink = getByText('系统管理').closest('a');
    expect(aiLink?.className).toContain('bg-sidebar-accent text-sidebar-accent-foreground');
    expect(adminLink?.className).not.toContain('bg-sidebar-accent text-sidebar-accent-foreground');
  });

  it('非管理员角色不再显示系统管理入口', () => {
    mockUser.role = Role.SALES;
    mockPathname = '/dashboard/settings';
    const { queryByText } = render(<Sidebar />);
    expect(queryByText('系统管理')).not.toBeInTheDocument();
  });

  it('初始渲染和空闲阶段不批量预取业务路由', () => {
    vi.useFakeTimers();
    render(<Sidebar />);
    vi.runOnlyPendingTimers();

    expect(mockPrefetch).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('记忆目标直接写入 Link，hover/focus/click 均不启动竞争预取', () => {
    vi.useFakeTimers();
    vi.mocked(localStorage.getItem).mockImplementation((key) => (
      key === 'tab_memory_/dashboard/finance' ? '/dashboard/finance/statements' : null
    ));
    const { getByText } = render(<Sidebar />);
    const financeLink = getByText('财务').closest('a');

    expect(financeLink).not.toBeNull();
    fireEvent.mouseEnter(financeLink!);
    fireEvent.focus(financeLink!);
    fireEvent.mouseEnter(financeLink!);

    expect(mockPrefetch).not.toHaveBeenCalled();
    expect(financeLink).toHaveAttribute('href', '/dashboard/finance/statements');
    expect(financeLink).toHaveAttribute('data-prefetch', 'auto');

    fireEvent.click(financeLink!);
    expect(mockPush).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});
