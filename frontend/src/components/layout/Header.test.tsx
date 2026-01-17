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

vi.mock('@/store/auth.store', () => ({
  useAuthStore: (selector: any) => selector({
    user: { name: '管理员', username: 'admin' },
    logout: mockLogout,
  }),
}));

describe('Header', () => {
  it('渲染搜索框与通知数量', () => {
    const { getByPlaceholderText, getByText } = render(<Header />);

    expect(getByPlaceholderText('搜索商品、合同或货柜...')).toBeTruthy();
    expect(getByText('3')).toBeTruthy();
  });

  it('渲染用户菜单按钮', () => {
    const { getAllByRole } = render(<Header />);

    const buttons = getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });
});
