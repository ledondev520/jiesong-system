/**
 * Input: DataDashboard组件、dashboard analytics API
 * Output: 数据看板组件测试结果
 * Pos: 工作台子组件测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { DataDashboard } from './DataDashboard';

const mockGetDashboardAnalytics = vi.fn();

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

describe('DataDashboard', () => {
  beforeEach(() => {
    mockGetDashboardAnalytics.mockReset();
  });

  it('加载成功后展示核心指标', async () => {
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

    render(<DataDashboard />);

    await waitFor(() => {
      expect(screen.getByText('采购合同')).toBeInTheDocument();
      expect(screen.getByText('销售合同')).toBeInTheDocument();
      expect(screen.getByText('应收账款')).toBeInTheDocument();
      expect(screen.getByText('库存概览')).toBeInTheDocument();
    });
  });

  it('无图表数据时展示空文案', async () => {
    mockGetDashboardAnalytics.mockResolvedValue({
      data: {
        contracts: {
          purchase: { count: 0, totalAmount: 0, paidAmount: 0, unpaidAmount: 0 },
          sales: { count: 0, totalAmount: 0, receivedAmount: 0, receivable: 0 },
        },
        inventory: { productCount: 0, recordCount: 0, totalQuantity: 0 },
        shipments: { monthly: [] },
        topProducts: [],
        storeStats: [],
      },
    });

    render(<DataDashboard />);

    await waitFor(() => {
      expect(screen.getByText('暂无出货数据')).toBeInTheDocument();
      expect(screen.getByText('暂无门店数据')).toBeInTheDocument();
      expect(screen.getByText('暂无商品数据')).toBeInTheDocument();
    });
  });
});
