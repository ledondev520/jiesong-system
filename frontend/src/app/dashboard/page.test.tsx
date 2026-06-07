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
import { Role } from '@/types';

const mockPush = vi.fn();
const mockGetDashboardAnalytics = vi.fn();
const mockPurchaseGetAll = vi.fn();
const mockSalesGetAll = vi.fn();
const mockListStatements = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    back: vi.fn(),
  }),
  usePathname: () => '/dashboard',
}));

vi.mock('@/store/auth.store', () => ({
  useAuthStore: () => ({
    user: { id: 'u-1', name: '管理员', role: Role.ADMIN },
  }),
}));

vi.mock('@/services/ai.service', () => ({
  aiService: {
    getDashboardAnalytics: (...args: unknown[]) => mockGetDashboardAnalytics(...args),
  },
}));

vi.mock('@/services/purchase.service', () => ({
  purchaseService: {
    getAll: (...args: unknown[]) => mockPurchaseGetAll(...args),
  },
}));

vi.mock('@/services/sales.service', () => ({
  salesService: {
    getAll: (...args: unknown[]) => mockSalesGetAll(...args),
  },
}));

vi.mock('@/services/financialStatements.service', () => ({
  financialStatementsService: {
    listStatements: (...args: unknown[]) => mockListStatements(...args),
  },
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Line: () => <div>Line</div>,
  BarChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Bar: () => <div>Bar</div>,
  AreaChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Area: () => <div>Area</div>,
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
    mockPurchaseGetAll.mockReset();
    mockSalesGetAll.mockReset();
    mockListStatements.mockReset();
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
    mockPurchaseGetAll.mockResolvedValue({
      data: {
        items: [
          { id: 'p-1', contractNo: 'PO-001', status: 'DRAFT' },
          { id: 'p-2', contractNo: 'PO-002', status: 'DRAFT' },
          { id: 'p-3', contractNo: 'PO-003', status: 'SIGNED' },
        ],
      },
    });
    mockSalesGetAll.mockResolvedValue({
      data: {
        items: [
          { id: 's-1', contractNo: 'EXP-001', status: 'CONFIRMED', totalBoxes: 0, grossWeight: 0, volume: 0 },
          { id: 's-2', contractNo: 'EXP-002', status: 'PACKING', totalBoxes: 10, grossWeight: 800, volume: 12 },
        ],
      },
    });
    mockListStatements.mockResolvedValue([
      { id: 'fs-1', periodLabel: '2026年3月账期' },
    ]);
  });

  it('渲染工作台首屏核心结构', async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('管理工作台')).toBeInTheDocument();
      expect(screen.getByText('采购、销售、仓储物流、财务')).toBeInTheDocument();
      expect(screen.getByText('待起草采购')).toBeInTheDocument();
      expect(screen.getByText('待补录出口')).toBeInTheDocument();
    });

    expect(screen.getByText('仓储物流')).toBeInTheDocument();
    expect(screen.getByText('财务')).toBeInTheDocument();
    expect(screen.getByText('近期待办')).toBeInTheDocument();
  });

  it('点击模块动作跳转到对应主线路径', async () => {
    const user = userEvent.setup();
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('管理工作台')).toBeInTheDocument();
    });

    await user.click(screen.getAllByText('新建采购合同')[0].closest('button')!);
    expect(mockPush).toHaveBeenCalledWith('/dashboard/purchase/create');

    await user.click(screen.getAllByText('供应商')[0].closest('button')!);
    expect(mockPush).toHaveBeenCalledWith('/dashboard/suppliers');

    await user.click(screen.getByRole('button', { name: /进入仓储物流/ }));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/logistics');

    await user.click(screen.getByRole('button', { name: /^进入采购/ }));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/contracts');
  });
});
