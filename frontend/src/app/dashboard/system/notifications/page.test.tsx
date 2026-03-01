/**
 * Input: 通知中心页面、system.service、toast
 * Output: 通知中心页交互测试
 * Pos: 运维模块
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SystemNotificationsPage from './page';

const mockGetSystemNotifications = vi.fn();
const mockMarkSystemNotificationRead = vi.fn();
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock('@/services/system.service', () => ({
  getSystemNotifications: (...args: unknown[]) => mockGetSystemNotifications(...args),
  markSystemNotificationRead: (...args: unknown[]) => mockMarkSystemNotificationRead(...args),
}));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}));

const unreadNotification = {
  id: 'n1',
  userId: 'u1',
  type: 'SYSTEM',
  title: '系统维护通知',
  content: '今晚 23:00 将进行维护',
  isRead: false,
  createdAt: '2026-03-01T09:00:00.000Z',
};

const readNotification = {
  id: 'n2',
  userId: 'u1',
  type: 'IMPORT',
  title: '导入完成',
  content: '导入任务已完成',
  isRead: true,
  createdAt: '2026-03-01T08:00:00.000Z',
};

describe('SystemNotificationsPage', () => {
  beforeEach(() => {
    mockGetSystemNotifications.mockReset();
    mockMarkSystemNotificationRead.mockReset();
    mockToastError.mockReset();
    mockToastSuccess.mockReset();
  });

  it('渲染通知列表', async () => {
    mockGetSystemNotifications.mockResolvedValue({
      data: {
        items: [unreadNotification, readNotification],
        unreadCount: 1,
        pagination: {
          total: 2,
          page: 1,
          pageSize: 50,
          totalPages: 1,
        },
      },
    });

    render(<SystemNotificationsPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '通知中心' })).toBeInTheDocument();
      expect(screen.getByText('系统维护通知')).toBeInTheDocument();
      expect(screen.getByText('导入完成')).toBeInTheDocument();
    });
  });

  it('支持仅未读筛选', async () => {
    mockGetSystemNotifications.mockResolvedValue({
      data: {
        items: [unreadNotification],
        unreadCount: 1,
        pagination: {
          total: 1,
          page: 1,
          pageSize: 50,
          totalPages: 1,
        },
      },
    });

    const user = userEvent.setup();
    render(<SystemNotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText('系统维护通知')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '仅未读' }));

    await waitFor(() => {
      expect(mockGetSystemNotifications).toHaveBeenLastCalledWith({
        page: 1,
        pageSize: 50,
        unreadOnly: true,
      });
    });
  });

  it('可将未读通知标记为已读', async () => {
    mockGetSystemNotifications.mockResolvedValue({
      data: {
        items: [unreadNotification],
        unreadCount: 1,
        pagination: {
          total: 1,
          page: 1,
          pageSize: 50,
          totalPages: 1,
        },
      },
    });
    mockMarkSystemNotificationRead.mockResolvedValue({ data: null });

    const user = userEvent.setup();
    render(<SystemNotificationsPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '标记已读' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '标记已读' }));

    await waitFor(() => {
      expect(mockMarkSystemNotificationRead).toHaveBeenCalledWith('n1');
      expect(mockToastSuccess).toHaveBeenCalledWith('已标记为已读');
    });
  });

  it('请求失败时展示错误提示', async () => {
    mockGetSystemNotifications.mockRejectedValue(new Error('network error'));
    render(<SystemNotificationsPage />);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('加载通知失败');
    });
  });
});
