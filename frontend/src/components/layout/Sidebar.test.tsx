/**
 * Input: Sidebar组件
 * Output: Sidebar组件单元测试
 * Pos: 前端布局组件测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';

const mockLogout = vi.fn();

vi.mock('@/store/auth.store', () => ({
  useAuthStore: (selector: (state: { logout: () => void }) => unknown) => selector({
    logout: mockLogout,
  }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/contracts',
}));

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

describe('Sidebar', () => {
  it('渲染导航项并标记当前路由', () => {
    const { getByText } = render(<Sidebar />);

    // 当前路由是 /dashboard/contracts，对应 "采购合同"
    const current = getByText('采购合同').closest('a');
    expect(current?.className.includes('bg-sidebar-primary/18')).toBe(true);
  });

  it('点击退出登录调用logout', () => {
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
    });

    const { getAllByRole } = render(<Sidebar />);
    fireEvent.click(getAllByRole('button', { name: '退出登录' })[0]);

    expect(mockLogout).toHaveBeenCalled();
    expect(window.location.href).toBe('/login');
  });
});
