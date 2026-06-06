/**
 * Reports Service 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reportsService } from './reports.service';
import api from '@/lib/axios';

vi.mock('@/lib/axios', () => ({
  default: {
    get: vi.fn(),
  },
}));

describe('reportsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应该获取供应商列表', async () => {
    const mockResponse = { code: 200, data: { items: [], pagination: { total: 0 } } };
    vi.mocked(api.get).mockResolvedValueOnce({ data: mockResponse });

    await reportsService.getSuppliers({ pageSize: 10 });

    expect(api.get).toHaveBeenCalledWith('/suppliers', { params: { pageSize: 10 } });
  });

  it('应该获取门店列表', async () => {
    const mockResponse = { code: 200, data: { items: [], pagination: { total: 0 } } };
    vi.mocked(api.get).mockResolvedValueOnce({ data: mockResponse });

    await reportsService.getStores();

    expect(api.get).toHaveBeenCalledWith('/stores', { params: undefined });
  });

  it('应该获取仪表盘统计', async () => {
    const mockResponse = { code: 200, data: { overview: { purchaseContracts: 10 } } };
    vi.mocked(api.get).mockResolvedValueOnce({ data: mockResponse });

    const result = await reportsService.getDashboardStats();

    expect(api.get).toHaveBeenCalledWith('/dashboard/stats');
    expect(result.data).toEqual(mockResponse);
  });

  it('应该按供应商获取采购', async () => {
    const mockResponse = { code: 200, data: { items: [] } };
    vi.mocked(api.get).mockResolvedValueOnce({ data: mockResponse });

    await reportsService.getPurchasesBySupplier('sup-1');

    expect(api.get).toHaveBeenCalledWith('/purchases', { params: { supplierId: 'sup-1', pageSize: 1 } });
  });

  it('应该按门店获取销售', async () => {
    const mockResponse = { code: 200, data: { items: [] } };
    vi.mocked(api.get).mockResolvedValueOnce({ data: mockResponse });

    await reportsService.getSalesByStore('store-1');

    expect(api.get).toHaveBeenCalledWith('/sales', { params: { storeId: 'store-1', pageSize: 1 } });
  });

  it('应该获取经营数据报表', async () => {
    const mockResponse = {
      code: 200,
      data: {
        overview: { totalSales: 100000, totalPurchases: 80000, grossProfit: 20000, profitMargin: 0.2 },
        funds: { totalReceivable: 50000, totalPayable: 30000, overdueReceivable: 10000, overduePayable: 5000 },
        inventory: { totalItems: 199, lowStockItems: 12, inTransitContainers: 41 },
        trends: { monthlySales: [{ month: '2026-01', amount: 100000 }] },
      },
    };
    vi.mocked(api.get).mockResolvedValueOnce({ data: mockResponse });

    const result = await reportsService.getBusinessOverview();

    expect(api.get).toHaveBeenCalledWith('/reports/business-overview');
    expect(result.data).toEqual(mockResponse);
  });
});
