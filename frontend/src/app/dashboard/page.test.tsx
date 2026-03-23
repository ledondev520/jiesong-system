/**
 * Input: 工作台页面、router、子组件占位
 * Output: 工作台关键入口交互测试结果
 * Pos: 前端首页交互测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DashboardPage from './page';
import type { ReactNode } from 'react';

const mockPush = vi.fn();
const mockGetDashboardAnalytics = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    back: vi.fn(),
  }),
  usePathname: () => '/dashboard',
}));

vi.mock('@/components/tools/ProductTracker', () => ({
  ProductTracker: () => <div>商品追踪模块</div>,
}));

vi.mock('@/services/ai.service', () => ({
  aiService: {
    getDashboardAnalytics: (...args: unknown[]) => mockGetDashboardAnalytics(...args),
  },
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Line: () => <div>Line</div>,
  BarChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Bar: () => <div>Bar</div>,
  XAxis: () => <div>XAxis</div>,
  YAxis: () => <div>YAxis</div>,
  CartesianGrid: () => <div>Grid</div>,
  Tooltip: () => <div>Tooltip</div>,
  Legend: () => <div>Legend</div>,
}));

describe('DashboardPage 交互逻辑', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockGetDashboardAnalytics.mockReset();
    mockGetDashboardAnalytics.mockResolvedValue({
      data: {
        contracts: {
          purchase: { count: 3, totalAmount: 10000, paidAmount: 6000, unpaidAmount: 4000 },
          sales: { count: 2, totalAmount: 5000, receivedAmount: 2000, receivable: 3000 },
        },
        inventory: { productCount: 9, recordCount: 20, totalQuantity: 500 },
        shipments: { monthly: [] },
        topProducts: [],
        storeStats: [],
      },
    });
  });

  it('渲染四块工作区首屏结构', async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('当前焦点')).toBeInTheDocument();
      expect(screen.getByText('高频动作')).toBeInTheDocument();
      expect(screen.getByText('风险提醒')).toBeInTheDocument();
      expect(screen.getByText('关键趋势')).toBeInTheDocument();
    });

    expect(screen.queryByText('快速录入')).not.toBeInTheDocument();
    expect(screen.getByText('商品追踪模块')).toBeInTheDocument();
  });

  it('点击四个高频动作跳转对应页面', async () => {
    const user = userEvent.setup();
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('高频动作')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '新建采购录入采购合同' }));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/purchase/create');

    await user.click(screen.getByRole('button', { name: '新建销售创建出口合同' }));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/sales/create');

    await user.click(screen.getByRole('button', { name: '采购合同查看采购履约' }));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/contracts');

    await user.click(screen.getByRole('button', { name: '收付管理跟进回款与付款' }));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/payments');
  });
});
