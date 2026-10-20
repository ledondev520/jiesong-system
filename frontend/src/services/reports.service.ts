import api, { type ApiRequestConfig } from '@/lib/axios';
import { ApiResponse, PaginatedResponse } from '@/types';

interface SupplierLite {
  id: string;
  name: string;
}

interface StoreLite {
  id: string;
  name: string;
}

interface PurchaseSummary {
  totalAmount?: number;
}

interface PurchaseSummaryResponse extends PaginatedResponse<PurchaseSummary> {
  total?: number;
}

export interface DashboardStats {
  overview?: {
    purchaseContracts?: number;
    salesContracts?: number;
    products?: number;
    containers?: number;
  };
}

export interface BusinessOverview {
  period: { startDate: string | null; endDate: string | null; dateField: 'shippedAt' };
  overview: {
    totalSales: number | null;
    totalPurchases: number | null;
    grossProfit: number | null;
    profitMargin: number | null;
    marginReady: boolean;
    cashReady: boolean;
    currency: 'CNY';
    contractCount: number;
    netCashCny: number | null;
    scope: string;
    unavailableContracts: Array<{ id: string; reasons: string[] }>;
  };
  funds: {
    totalReceivable: number;
    totalPayable: number;
    overdueReceivable: number;
    overduePayable: number;
    overdueRule: string;
  };
  inventory: {
    totalItems: number;
    lowStockItems: number;
    inTransitContainers: number;
  };
  trends: {
    monthlySales: Array<{ month: string; amount: number | null }>;
  };
}

export const reportsService = {
  getSuppliers: async (params?: { pageSize?: number }) => {
    return api.get<ApiResponse<PaginatedResponse<SupplierLite>>, ApiResponse<PaginatedResponse<SupplierLite>>>(
      '/suppliers',
      { params },
    );
  },

  getStores: async (params?: { pageSize?: number }) => {
    return api.get<ApiResponse<PaginatedResponse<StoreLite>>, ApiResponse<PaginatedResponse<StoreLite>>>(
      '/stores',
      { params },
    );
  },

  getDashboardStats: async () => {
    return api.get<ApiResponse<DashboardStats>, ApiResponse<DashboardStats>>('/dashboard/stats');
  },

  getPurchasesBySupplier: async (supplierId: string) => {
    return api.get<ApiResponse<PurchaseSummaryResponse>, ApiResponse<PurchaseSummaryResponse>>('/purchases', {
      params: { supplierId, pageSize: 1 },
    });
  },

  getSalesByStore: async (storeId: string) => {
    return api.get<ApiResponse<PurchaseSummaryResponse>, ApiResponse<PurchaseSummaryResponse>>('/sales', {
      params: { storeId, pageSize: 1 },
    });
  },

  getBusinessOverview: async (params?: { startDate?: string; endDate?: string }) => {
    const config: ApiRequestConfig = { params, cache: { enabled: false } };
    return api.get<ApiResponse<BusinessOverview>, ApiResponse<BusinessOverview>>('/reports/business-overview', config);
  },
};
