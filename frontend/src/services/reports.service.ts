import api from '@/lib/axios';
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
  overview: {
    totalSales: number;
    totalPurchases: number;
    grossProfit: number;
    profitMargin: number;
  };
  funds: {
    totalReceivable: number;
    totalPayable: number;
    overdueReceivable: number;
    overduePayable: number;
  };
  inventory: {
    totalItems: number;
    lowStockItems: number;
    inTransitContainers: number;
  };
  trends: {
    monthlySales: Array<{ month: string; amount: number }>;
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

  getBusinessOverview: async () => {
    return api.get<ApiResponse<BusinessOverview>, ApiResponse<BusinessOverview>>('/reports/business-overview');
  },
};
