/**
 * Input: Header组件
 * Output: Header组件单元测试
 * Pos: 前端布局组件测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { Header } from './Header';

const mockLogout = vi.fn();
const mockPush = vi.fn();
type AuthStoreMock = {
  user: { name: string; username: string };
  logout: () => void;
};

vi.mock('@/store/auth.store', () => ({
  useAuthStore: <T,>(selector: (state: AuthStoreMock) => T): T => selector({
    user: { name: '管理员', username: 'admin' },
    logout: mockLogout,
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/dashboard',
}));

vi.mock('@/lib/axios', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { items: [] } }),
  },
}));

describe('Header', () => {
  it('渲染搜索框与用户菜单', () => {
    const { getByPlaceholderText } = render(<Header />);

    // 搜索框placeholder已更新
    expect(getByPlaceholderText('搜索商品、供应商、货柜...')).toBeTruthy();
  });

  it('渲染用户菜单按钮', () => {
    const { getAllByRole } = render(<Header />);

    const buttons = getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });
});
