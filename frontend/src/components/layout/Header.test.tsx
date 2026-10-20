/**
 * Input: Header组件、统一搜索服务、router
 * Output: Header搜索与壳层交互测试
 * Pos: 前端布局组件测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Role } from '@/types';
import { Header } from './Header';

const mockLogout = vi.fn();
const mockPush = vi.fn();
const mockSearchDashboard = vi.fn();
const mockUpdateProfile = vi.fn();
const mockUser = {
  name: '管理员',
  username: 'admin',
  role: Role.ADMIN,
};

vi.mock('@/store/auth.store', () => ({
  useAuthStore: <T,>(selector: (state: {
    user: typeof mockUser;
    logout: () => void;
    updateProfile: (profile: { name?: string; avatar?: string }) => void;
  }) => T): T => selector({
    user: mockUser,
    logout: mockLogout,
    updateProfile: mockUpdateProfile,
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

vi.mock('@/services/dashboardSearch.service', () => ({
  searchDashboard: (...args: unknown[]) => mockSearchDashboard(...args),
  getDashboardSearchHref: (result: { type: string; id: string; title: string }) => {
    if (result.type === 'product') {
      return `/dashboard/products?keyword=${encodeURIComponent(result.title)}`;
    }

    return `/dashboard/sales/${result.id}`;
  },
}));

describe('Header', () => {
  beforeEach(() => {
    mockLogout.mockReset();
    mockPush.mockReset();
    mockSearchDashboard.mockReset();
    mockUpdateProfile.mockReset();
  });

  it('渲染搜索框与用户菜单', () => {
    render(<Header />);

    expect(screen.getByRole('button', { name: /搜索商品、供应商、合同/ })).toBeInTheDocument();
    expect(screen.queryByText('当前模块')).not.toBeInTheDocument();
    expect(screen.queryByText('经营中台')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '用户菜单' })).toBeInTheDocument();
  });

  it('输入关键字后调用统一搜索服务并展示结果', async () => {
    mockSearchDashboard.mockResolvedValue([
      { type: 'product', id: 'p-1', title: '瓷砖 A', subtitle: '600x600' },
    ]);

    const user = userEvent.setup();
    render(<Header />);

    await user.click(screen.getByRole('button', { name: /搜索商品、供应商、合同/ }));
    await user.type(screen.getByPlaceholderText('输入关键词搜索...'), '瓷砖');

    await waitFor(() => {
      expect(mockSearchDashboard).toHaveBeenCalledWith('瓷砖');
    }, { timeout: 1000 });

    expect(await screen.findByText('瓷砖 A')).toBeInTheDocument();
    expect(screen.getByText('600x600')).toBeInTheDocument();
  });

  it('点击搜索结果后按结果映射跳转并清空输入', async () => {
    mockSearchDashboard.mockResolvedValue([
      { type: 'product', id: 'p-1', title: '瓷砖 A', subtitle: '600x600' },
    ]);

    const user = userEvent.setup();
    render(<Header />);

    await user.click(screen.getByRole('button', { name: /搜索商品、供应商、合同/ }));
    const input = screen.getByPlaceholderText('输入关键词搜索...') as HTMLInputElement;
    await user.type(input, '瓷砖');

    await user.click(await screen.findByText('瓷砖 A'));

    expect(mockPush).toHaveBeenCalledWith('/dashboard/products?keyword=%E7%93%B7%E7%A0%96%20A');
    expect(screen.queryByPlaceholderText('输入关键词搜索...')).not.toBeInTheDocument();
  });

  it('较慢的旧查询不会覆盖新查询结果', async () => {
    let resolveOld!: (results: Array<{ type: string; id: string; title: string }>) => void;
    mockSearchDashboard.mockImplementation((query: string) => query === '旧查询'
      ? new Promise((resolve) => { resolveOld = resolve; })
      : Promise.resolve([{ type: 'product', id: 'new', title: '新查询结果' }]));
    const user = userEvent.setup();
    render(<Header />);
    await user.click(screen.getByRole('button', { name: /搜索商品、供应商、合同/ }));
    const input = screen.getByPlaceholderText('输入关键词搜索...');
    await user.type(input, '旧查询');
    await waitFor(() => expect(mockSearchDashboard).toHaveBeenCalledWith('旧查询'));
    await user.clear(input);
    await user.type(input, '新查询');
    expect(await screen.findByText('新查询结果')).toBeInTheDocument();

    await act(async () => resolveOld([{ type: 'product', id: 'old', title: '旧查询结果' }]));
    expect(screen.getByText('新查询结果')).toBeInTheDocument();
    expect(screen.queryByText('旧查询结果')).not.toBeInTheDocument();
  });

  it('点击个人设置后打开用户弹窗，而不是跳转系统配置', async () => {
    const user = userEvent.setup();

    render(<Header />);

    await user.click(screen.getByRole('button', { name: '用户菜单' }));
    await user.click(screen.getByRole('menuitem', { name: '个人设置' }));

    expect(await screen.findByRole('dialog', { name: '个人设置' })).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalledWith('/dashboard/settings');
  });
});
