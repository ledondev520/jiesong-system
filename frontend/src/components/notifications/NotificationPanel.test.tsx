import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotificationPanel } from './NotificationPanel';
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
describe('通知业务跳转', () => {
  it('菜单关闭回调不吞掉导航，历史库存链接可进入当前商品风险明细', async () => {
    const close = vi.fn(); const read = vi.fn();
    render(<NotificationPanel notifications={[{ id: 'n1', userId: 'synthetic-user', type: 'LOW_STOCK', title: '合成库存提醒', content: '', link: '/dashboard/inventory', isRead: false, createdAt: '2026-10-01' }]} unreadCount={1} loading={false} onMarkRead={read} onMarkAllRead={vi.fn()} onNavigate={close} />);
    await userEvent.click(screen.getByRole('button', { name: /合成库存提醒/ }));
    expect(push).toHaveBeenCalledWith('/dashboard/products?lowStock=true');
    expect(close).toHaveBeenCalled(); expect(read).toHaveBeenCalledWith('n1');
  });
});
