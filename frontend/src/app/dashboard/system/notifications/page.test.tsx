import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NotificationsPage from './page';
const list = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ back: vi.fn() }), usePathname: () => '/dashboard/system/notifications' }));
vi.mock('@/services/system.service', () => ({ getSystemNotifications: (...args: unknown[]) => list(...args), markSystemNotificationRead: vi.fn() }));
describe('历史通知服务端分页', () => {
  it('第4页仍可达，搜索包含标题并保留业务钻取', async () => {
    list.mockResolvedValue({ data: { items: [{ id: 'n1', userId: 'synthetic', type: 'LOW_STOCK', title: '合成预警标题', content: '合成内容', isRead: true, createdAt: '2026-10-01', link: '/dashboard/inventory' }], pagination: { total: 81 }, unreadCount: 0 } });
    render(<NotificationsPage />);
    const user = userEvent.setup();
    await screen.findAllByText('合成预警标题');
    expect(list).toHaveBeenLastCalledWith({ page: 1, pageSize: 20, keyword: undefined, unreadOnly: false });
    for (let page = 2; page <= 4; page++) {
      await user.click(screen.getByRole('button', { name: '下一页' }));
      await waitFor(() => expect(list).toHaveBeenLastCalledWith({ page, pageSize: 20, keyword: undefined, unreadOnly: false }));
    }
    expect(screen.getByText('共 81 条，第 4/5 页')).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('搜索标题、内容、类型...'), '合成');
    await waitFor(() => expect(list).toHaveBeenLastCalledWith({ page: 1, pageSize: 20, keyword: '合成', unreadOnly: false }));
    expect(screen.getAllByRole('link', { name: /合成预警标题|打开业务明细/ })[0]).toHaveAttribute('href', '/dashboard/products?lowStock=true');
  });
});
