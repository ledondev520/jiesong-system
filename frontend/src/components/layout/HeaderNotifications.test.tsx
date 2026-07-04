/**
 * Input: HeaderNotifications 组件、通知服务 mock
 * Output: 全局通知入口只读加载行为回归测试
 * Pos: 防止 Header 在页面切换时执行通知生成写操作并冲掉 GET 缓存
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { HeaderNotifications } from './HeaderNotifications';

const mockGetList = vi.fn();
const mockGetUnreadCount = vi.fn();
const mockGenerate = vi.fn();
const mockMarkRead = vi.fn();
const mockMarkAllRead = vi.fn();

vi.mock('@/services/notification.service', () => ({
  notificationService: {
    getList: (...args: unknown[]) => mockGetList(...args),
    getUnreadCount: (...args: unknown[]) => mockGetUnreadCount(...args),
    generate: (...args: unknown[]) => mockGenerate(...args),
    markRead: (...args: unknown[]) => mockMarkRead(...args),
    markAllRead: (...args: unknown[]) => mockMarkAllRead(...args),
  },
}));

describe('HeaderNotifications', () => {
  beforeEach(() => {
    mockGetList.mockReset();
    mockGetUnreadCount.mockReset();
    mockGenerate.mockReset();
    mockMarkRead.mockReset();
    mockMarkAllRead.mockReset();
    mockGetList.mockResolvedValue({ data: { items: [] } });
    mockGetUnreadCount.mockResolvedValue({ data: { count: 0 } });
  });

  it('挂载时只读取通知，不自动生成通知', async () => {
    render(<HeaderNotifications />);

    await waitFor(() => {
      expect(mockGetList).toHaveBeenCalledWith({ page: 1, pageSize: 50 });
      expect(mockGetUnreadCount).toHaveBeenCalledTimes(1);
    });
    expect(mockGenerate).not.toHaveBeenCalled();
  });
});
