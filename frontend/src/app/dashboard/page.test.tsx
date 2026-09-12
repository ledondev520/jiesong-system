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
import { Role } from '@/types';

const mockPush = vi.fn();
const mockGetDashboardAnalytics = vi.fn();
const mockPurchaseGetAll = vi.fn();
const mockSalesGetAll = vi.fn();
const mockListStatements = vi.fn();
const mockListTradeWorkflows = vi.fn();
const mockSyncStatus = vi.fn();

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

vi.mock('@/services/tradeWorkflow.service', () => ({
  tradeWorkflowService: {
    syncStatus: (...args: unknown[]) => mockSyncStatus(...args),
    list: (...args: unknown[]) => mockListTradeWorkflows(...args),
  },
}));

describe('DashboardPage 交互逻辑', () => {
  beforeEach(() => {
    mockSyncStatus.mockResolvedValue({ data: { state: 'needs_review', lastSuccessAt: '2026-09-12T07:00:00Z', conflicts: 418 } });
    mockPush.mockReset();
    mockGetDashboardAnalytics.mockReset();
    mockPurchaseGetAll.mockReset();
    mockSalesGetAll.mockReset();
    mockListStatements.mockReset();
    mockListTradeWorkflows.mockReset();
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
    mockListTradeWorkflows.mockResolvedValue({
      data: [{
        id: 's-1',
        contractNo: 'EXP-001',
        status: 'PACKING',
        purchaseContractNos: ['CG-001'],
        completedStageCount: 2,
        stageCount: 8,
        nextAction: { label: '登记采购尾款', href: '/dashboard/purchase/p-1' },
        issues: [],
        stages: [
          { key: 'procurement', label: '采购签约', status: 'completed', reason: '已签约' },
          { key: 'payment', label: '采购付款', status: 'current', reason: '仍有尾款待付' },
        ],
        readiness: {
          weightPct: 20, volumePct: 30, utilizationReady: false, overloaded: false,
          overloadReasons: [], physicalFit: true, placedBoxCount: 10, unplacedBoxCount: 0,
          estimatedDimensionCount: 0, missingBoxItemCount: 0, blockers: ['under-utilized'], ready: false,
        },
        finance: {
          purchaseTotal: 10000, purchasePaid: 3000, salesTotalUsd: 2000,
          receivedUsd: 0, exchangeRate: 6.64,
        },
      }],
    });
  });

  it('展示真实同步时间和历史差异；接口失败明确提示而不冒充同步正常', async () => {
    const view = render(<DashboardPage />);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('418 项待核对'));
    expect(screen.getByRole('status')).toHaveTextContent('2026/9/12');
    view.unmount();
    mockSyncStatus.mockRejectedValueOnce(new Error('unavailable'));
    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('状态读取失败'));
  });

  it('渲染工作台首屏核心结构', async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '工作台' })).toBeInTheDocument();
      expect(screen.getByText('待起草采购')).toBeInTheDocument();
      expect(screen.getByText('出口待补录')).toBeInTheDocument();
    });

    expect(screen.queryByText('仓储物流')).not.toBeInTheDocument();
    expect(screen.getByText('库存记录')).toBeInTheDocument();
    expect(screen.getByText('出口专项单主线路')).toBeInTheDocument();
    expect(screen.getByText('EXP-001')).toBeInTheDocument();
  });

  it('财务账期按年月显示最新一项，不依赖列表返回顺序', async () => {
    mockListStatements.mockResolvedValue([
      { id: 'fs-1', year: 2025, month: 1, periodLabel: '2025年1账期' },
      { id: 'fs-2', year: 2025, month: 12, periodLabel: '2025年12账期' },
      { id: 'fs-3', year: 2025, month: 6, periodLabel: '2025年6账期' },
    ]);

    render(<DashboardPage />);

    expect(await screen.findByText('2025年12账期')).toBeInTheDocument();
    expect(screen.queryByText('2025年1账期')).not.toBeInTheDocument();
  });

  it('首页只给出该专项单的唯一下一动作', async () => {
    const user = userEvent.setup();
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('EXP-001')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'EXP-001 下一步：登记采购尾款' }));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/purchase/p-1');
  });

  it('点击快速动作跳转到对应路径', async () => {
    const user = userEvent.setup();
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '工作台' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /新建采购合同/ }));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/purchase/create');

    await user.click(screen.getByRole('button', { name: /新建出口合同/ }));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/sales/create');

    await user.click(screen.getByRole('button', { name: /查看报关单/ }));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/tax-refunds?view=customs');
  });
});
