/**
 * Input: Sidebar组件
 * Output: Sidebar组件单元测试
 * Pos: 前端布局组件测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { Sidebar } from './Sidebar';

const mockLogout = vi.fn();

vi.mock('@/store/auth.store', () => ({
  useAuthStore: (selector: any) => selector({
    logout: mockLogout,
  }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/products',
}));

vi.mock('next/link', () => ({
  default: ({ href, children, className }: any) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

describe('Sidebar', () => {
  it('渲染导航项并标记当前路由', () => {
    const { getByText } = render(<Sidebar />);

    const current = getByText('商品管理');
    expect(current.className.includes('bg-muted')).toBe(true);
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
