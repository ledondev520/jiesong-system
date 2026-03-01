/**
 * Input: 系统日志页面、system.service、toast
 * Output: 系统日志页交互测试
 * Pos: 运维模块
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SystemLogsPage from './page';
import { Role } from '@/types';

const mockGetSystemLogs = vi.fn();
const mockToastError = vi.fn();
const mockUser = {
  role: Role.ADMIN,
};

vi.mock('@/store/auth.store', () => ({
  useAuthStore: (selector: (state: { user: typeof mockUser | null }) => unknown) => selector({
    user: mockUser,
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock('@/services/system.service', () => ({
  getSystemLogs: (...args: unknown[]) => mockGetSystemLogs(...args),
}));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: vi.fn(),
  },
}));

const fullLog = {
  id: '1',
  userId: 'u1',
  action: 'IMPORT',
  entity: 'Contract',
  entityId: 'c1',
  oldValue: 'old',
  newValue: 'new',
  ipAddress: '10.0.0.1',
  createdAt: '2026-03-01T08:00:00.000Z',
  user: {
    id: 'u1',
    name: '管理员',
    username: 'admin',
  },
};

const otherLog = {
  ...fullLog,
  id: '2',
  action: 'UPDATE',
  entity: 'Setting',
  entityId: 's1',
  oldValue: '',
  newValue: '',
};

describe('SystemLogsPage', () => {
  beforeEach(() => {
    mockUser.role = Role.ADMIN;
    mockGetSystemLogs.mockReset();
    mockToastError.mockReset();
  });

  it('渲染日志列表', async () => {
    mockGetSystemLogs.mockResolvedValue({
      data: {
        items: [fullLog],
        pagination: {
          total: 1,
          page: 1,
          pageSize: 50,
          totalPages: 1,
        },
      },
    });

    render(<SystemLogsPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '系统日志' })).toBeInTheDocument();
      expect(screen.getByText('管理员')).toBeInTheDocument();
      expect(screen.getByText('IMPORT')).toBeInTheDocument();
    });
  });

  it('可切换查看导入日志', async () => {
    mockGetSystemLogs.mockResolvedValue({
      data: {
        items: [fullLog, otherLog],
        pagination: {
          total: 2,
          page: 1,
          pageSize: 50,
          totalPages: 1,
        },
      },
    });

    const user = userEvent.setup();
    render(<SystemLogsPage />);

    await waitFor(() => {
      expect(screen.getByText('UPDATE')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '导入日志' }));

    await waitFor(() => {
      expect(screen.getByText('IMPORT')).toBeInTheDocument();
      expect(screen.queryByText('UPDATE')).toBeNull();
    });
  });

  it('请求失败时展示错误提示', async () => {
    mockGetSystemLogs.mockRejectedValue(new Error('network error'));
    render(<SystemLogsPage />);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('加载日志失败');
    });
  });

  it('非管理员角色不请求日志并显示无权限提示', async () => {
    mockUser.role = Role.SALES;
    render(<SystemLogsPage />);

    await waitFor(() => {
      expect(screen.getByText('无权限访问')).toBeInTheDocument();
    });
    expect(screen.getByText('当前账号角色无权查看系统日志。')).toBeInTheDocument();
    expect(mockGetSystemLogs).not.toHaveBeenCalled();
  });
});
