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
      expect(screen.getByText('优先处理回款')).toBeInTheDocument();
      expect(screen.getByText(/待收回款/)).toBeInTheDocument();
      expect(screen.getByText('经营趋势')).toBeInTheDocument();
    });
  });

  it('无应收但有待付时聚焦采购付款', async () => {
    mockGetDashboardAnalytics.mockResolvedValue({
      data: {
        contracts: {
          purchase: { count: 2, totalAmount: 6000, paidAmount: 1000, unpaidAmount: 5000 },
          sales: { count: 1, totalAmount: 3000, receivedAmount: 3000, receivable: 0 },
        },
        inventory: { productCount: 4, recordCount: 8, totalQuantity: 40 },
        shipments: { monthly: [] },
        topProducts: [],
        storeStats: [],
      },
    });

    render(<DataDashboard />);

    await waitFor(() => {
      expect(screen.getByText('优先处理待付款采购')).toBeInTheDocument();
      expect(screen.getByText(/采购待付/)).toBeInTheDocument();
    });
  });

  it('数据为空时展示低噪音风险与趋势空态', async () => {
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
      expect(screen.getByText('当前没有需要立即处理的经营风险')).toBeInTheDocument();
      expect(screen.getByText('暂无出货趋势数据')).toBeInTheDocument();
      expect(screen.getByText('暂无商品数据')).toBeInTheDocument();
    });
  });

  it('加载成功后不再展示门店采购排行图表', async () => {
    mockGetDashboardAnalytics.mockResolvedValue({
      data: {
        contracts: {
          purchase: { count: 3, totalAmount: 10000, paidAmount: 6000, unpaidAmount: 4000 },
          sales: { count: 2, totalAmount: 5000, receivedAmount: 2000, receivable: 3000 },
        },
        inventory: { productCount: 9, recordCount: 20, totalQuantity: 500 },
        shipments: {
          monthly: [{ month: '2026-02', count: 2, amount: 3000, boxes: 12 }],
        },
        topProducts: [{ productName: '蓝牙耳机', count: 3, quantity: 120, totalAmount: 2000 }],
        storeStats: [{ storeName: '杭州一店', orderCount: 2, quantity: 100, totalAmount: 1200 }],
      },
    });

    render(<DataDashboard />);

    await waitFor(() => {
      expect(screen.getByText('月度出货趋势')).toBeInTheDocument();
      expect(screen.getByText('热门采购商品')).toBeInTheDocument();
    });

    expect(screen.queryByText('门店采购排行')).not.toBeInTheDocument();
  });
});
