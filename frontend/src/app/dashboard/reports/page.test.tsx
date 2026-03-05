/**
 * Input: 报表页面、api请求模块
 * Output: 报表页交互逻辑测试结果
 * Pos: 前端统计页面交互测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReportsPage from './page';

const mockGetSuppliers = vi.fn();
const mockGetStores = vi.fn();
const mockGetDashboardStats = vi.fn();
const mockGetPurchasesBySupplier = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
  }),
}));

vi.mock('@/services/reports.service', () => ({
  reportsService: {
    getSuppliers: (...args: unknown[]) => mockGetSuppliers(...args),
    getStores: (...args: unknown[]) => mockGetStores(...args),
    getDashboardStats: (...args: unknown[]) => mockGetDashboardStats(...args),
    getPurchasesBySupplier: (...args: unknown[]) => mockGetPurchasesBySupplier(...args),
  },
}));

describe('ReportsPage 交互逻辑', () => {
  beforeEach(() => {
    mockGetSuppliers.mockReset();
    mockGetStores.mockReset();
    mockGetDashboardStats.mockReset();
    mockGetPurchasesBySupplier.mockReset();
  });

  it('加载后展示汇总和供应商统计', async () => {
    mockGetSuppliers.mockResolvedValue({ data: { items: [{ id: 'sp-1', name: '供应商A' }] } });
    mockGetStores.mockResolvedValue({ data: { items: [{ id: 'st-1', name: '洛杉矶店' }] } });
    mockGetDashboardStats.mockResolvedValue({
      data: { overview: { purchaseContracts: 3, salesContracts: 2, products: 10, containers: 1 } },
    });
    mockGetPurchasesBySupplier.mockResolvedValue({ data: { items: [{ totalAmount: 5000 }], total: 1 } });

    render(<ReportsPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '报表统计' })).toBeInTheDocument();
      expect(screen.getByText('供应商A')).toBeInTheDocument();
      expect(screen.getByText('采购汇总')).toBeInTheDocument();
    });
  });

  it('切换到门店列表标签后展示门店名称', async () => {
    mockGetSuppliers.mockResolvedValue({ data: { items: [] } });
    mockGetStores.mockResolvedValue({ data: { items: [{ id: 'st-1', name: '洛杉矶店' }] } });
    mockGetDashboardStats.mockResolvedValue({
      data: { overview: { purchaseContracts: 0, salesContracts: 0, products: 0, containers: 0 } },
    });
    mockGetPurchasesBySupplier.mockResolvedValue({ data: { items: [], total: 0 } });

    const user = userEvent.setup();
    render(<ReportsPage />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: '门店列表' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('tab', { name: '门店列表' }));

    await waitFor(() => {
      expect(screen.getByText('门店名称')).toBeInTheDocument();
      expect(screen.getByText('洛杉矶店')).toBeInTheDocument();
    });
  });
});
