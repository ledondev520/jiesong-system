/**
 * Input: 用户管理页面、userService、UserDialog、toast
 * Output: 用户管理页交互逻辑测试结果
 * Pos: 前端业务页交互测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UsersPage from './page';

const mockGetAll = vi.fn();
const mockToastError = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
  }),
}));

vi.mock('@/services/user.service', () => ({
  userService: {
    getAll: (...args: unknown[]) => mockGetAll(...args),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: vi.fn(),
  },
}));

vi.mock('./components/UserDialog', () => ({
  UserDialog: ({ open }: { open: boolean }) => (open ? <div>用户弹窗已打开</div> : null),
}));

vi.mock('@/lib/api-cache', () => ({
  cachedFetch: async (_key: string, fetcher: () => unknown) => fetcher(),
  invalidateCache: vi.fn(),
  clearAllCache: vi.fn(),
}));

describe('UsersPage 交互逻辑', () => {
  beforeEach(() => {
    mockGetAll.mockReset();
    mockToastError.mockReset();
  });

  it('无数据时展示空态', async () => {
    mockGetAll.mockResolvedValue({ data: { items: [] } });
    render(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '用户管理' })).toBeInTheDocument();
      expect(screen.getByText('暂无用户。')).toBeInTheDocument();
    });
  });

  it('点击新增用户会打开弹窗', async () => {
    mockGetAll.mockResolvedValue({ data: { items: [] } });
    const user = userEvent.setup();
    render(<UsersPage />);

    await user.click(screen.getByRole('button', { name: /新增用户/ }));
    expect(screen.getByText('用户弹窗已打开')).toBeInTheDocument();
  });

  it('展示头像占位与最后登录时间', async () => {
    mockGetAll.mockResolvedValue({
      data: {
        items: [{
          id: 'u-1',
          username: 'admin',
          name: '管理员',
          role: 'ADMIN',
          isActive: true,
          lastLoginAt: '2026-03-01T10:00:00',
          createdAt: '2026-03-01T09:00:00',
          updatedAt: '2026-03-01T09:00:00',
        }],
      },
    });

    render(<UsersPage />);

    await waitFor(() => {
      expect(screen.getAllByText('管理员')).toHaveLength(2);
      expect(screen.getByText('admin')).toBeInTheDocument();
      expect(screen.getByText('2026-03-01 10:00')).toBeInTheDocument();
    });
  });

  it('加载失败时提示错误', async () => {
    mockGetAll.mockRejectedValue(new Error('load failed'));
    render(<UsersPage />);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('加载用户失败');
    });
  });
});
