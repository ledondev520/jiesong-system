import api from '@/lib/axios';
import { Payment, ApiResponse, PaginatedResponse } from '@/types';

interface FinanceStats {
  totalPayable: number;
  totalReceivable: number;
  monthlyCashIn: number;
  monthlyCashOut: number;
}

const DEFAULT_FINANCE_STATS: FinanceStats = {
  totalPayable: 0,
  totalReceivable: 0,
  monthlyCashIn: 0,
  monthlyCashOut: 0,
};

export const financeService = {
  getPayments: async (params?: { page?: number; pageSize?: number; type?: string }) => {
    return api.get<ApiResponse<PaginatedResponse<Payment>>, ApiResponse<PaginatedResponse<Payment>>>('/finance/payments', { params });
  },

  createPayment: async (data: Partial<Payment>) => {
    return api.post<ApiResponse<Payment>, ApiResponse<Payment>, Partial<Payment>>('/finance/payments', data);
  },

  getStats: async () => {
    // 从后端获取统计数据
    const response = await api.get<ApiResponse<FinanceStats>, ApiResponse<FinanceStats>>('/finance/stats');
    return response.data || DEFAULT_FINANCE_STATS;
  }
};
