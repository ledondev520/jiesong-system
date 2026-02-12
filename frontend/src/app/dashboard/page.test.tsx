/**
 * Input: 工作台页面、router、子组件占位
 * Output: 工作台关键入口交互测试结果
 * Pos: 前端首页交互测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DashboardPage from './page';

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    back: vi.fn(),
  }),
}));

vi.mock('@/components/ai/AIGreeting', () => ({
  AIGreeting: () => <div>AI问候模块</div>,
}));

vi.mock('@/components/tools/ProductTracker', () => ({
  ProductTracker: () => <div>商品追踪模块</div>,
}));

vi.mock('@/components/dashboard/DataDashboard', () => ({
  DataDashboard: () => <div>数据看板模块</div>,
}));

describe('DashboardPage 交互逻辑', () => {
  it('点击新建采购跳转采购创建页', async () => {
    const user = userEvent.setup();
    render(<DashboardPage />);

    await user.click(screen.getByRole('button', { name: '新建采购录入采购合同' }));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/purchase/create');
  });

  it('点击新建销售跳转销售创建页', async () => {
    const user = userEvent.setup();
    render(<DashboardPage />);

    await user.click(screen.getByRole('button', { name: '新建销售创建出口合同' }));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/sales/create');
  });
});

