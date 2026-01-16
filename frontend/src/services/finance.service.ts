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
    // Mock stats
    return {
      totalPayable: 125000,
      totalReceivable: 85000,
      monthlyCashIn: 45000,
      monthlyCashOut: 22000,
    };
  }
};
