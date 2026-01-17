import api from '@/lib/axios';
import { Payment, ApiResponse, PaginatedResponse } from '@/types';

export const financeService = {
  getPayments: async (params?: { page?: number; pageSize?: number; type?: string }) => {
    return api.get<any, ApiResponse<PaginatedResponse<Payment>>>('/finance/payments', { params });
  },

  createPayment: async (data: Partial<Payment>) => {
    return api.post<any, ApiResponse<Payment>>('/finance/payments', data);
  },

  getStats: async () => {
    // 从后端获取统计数据
    const response = await api.get('/finance/stats');
    return (response as { data: any }).data || {
      totalPayable: 0,
      totalReceivable: 0,
      monthlyCashIn: 0,
      monthlyCashOut: 0,
    };
  }
};
