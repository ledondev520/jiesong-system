/**
 * Input: Sidebar组件
 * Output: Sidebar组件单元测试
 * Pos: 前端布局组件测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Role } from '@/types';
import { Sidebar } from './Sidebar';

const mockLogout = vi.fn();
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
    mockUser.role = Role.ADMIN;
    mockPathname = '/dashboard/contracts';
  });

  it('渲染导航项并标记当前路由', () => {
    const { getByText, queryByText } = render(<Sidebar />);

    // 当前路由是 /dashboard/contracts，对应 "采购合同"
    const current = getByText('采购合同').closest('a');
    expect(current?.className.includes('bg-sidebar-accent')).toBe(true);
    expect(getByText('出口退税')).toBeInTheDocument();
    expect(getByText('系统管理')).toBeInTheDocument();
    expect(queryByText('通知中心')).toBeNull();
    expect(queryByText('系统日志')).toBeNull();
  });

  it('点击退出登录调用logout', () => {
    const { getByRole } = render(<Sidebar />);
    fireEvent.click(getByRole('button', { name: '退出登录' }));

    expect(mockLogout).toHaveBeenCalled();
  });

  it('系统管理路由下展示管理员子菜单', () => {
    mockPathname = '/dashboard/system';
    const { getByText } = render(<Sidebar />);

    expect(getByText('通知中心')).toBeInTheDocument();
    expect(getByText('系统日志')).toBeInTheDocument();
    expect(getByText('导入记录')).toBeInTheDocument();
  });

  it('非管理员角色不显示系统日志入口', () => {
    mockUser.role = Role.SALES;
    mockPathname = '/dashboard/system';
    const { queryByText } = render(<Sidebar />);
    expect(queryByText('系统管理')).toBeNull();
    expect(queryByText('系统日志')).toBeNull();
    expect(queryByText('导入记录')).toBeNull();
  });
});
