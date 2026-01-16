import api from '@/lib/axios';
import { SalesContract, ApiResponse, PaginatedResponse } from '@/types';

export const salesService = {
  getAll: async (params?: { page?: number; pageSize?: number; query?: string }) => {
    return api.get<any, ApiResponse<PaginatedResponse<SalesContract>>>('/sales/contracts', { params });
  },

  getById: async (id: string) => {
    return api.get<any, ApiResponse<SalesContract>>(`/sales/contracts/${id}`);
  },

  create: async (data: Partial<SalesContract>) => {
    return api.post<any, ApiResponse<SalesContract>>('/sales/contracts', data);
  },

  update: async (id: string, data: Partial<SalesContract>) => {
    return api.put<any, ApiResponse<SalesContract>>(`/sales/contracts/${id}`, data);
  },

  delete: async (id: string) => {
    return api.delete<any, ApiResponse<void>>(`/sales/contracts/${id}`);
  },

  // Helper to calculate price
  calculatePrice: (costPrice: number, exchangeRate: number, profitRate: number) => {
    // Formula: Cost / (Rate - 0.2) * Profit
    // Ensure rate - 0.2 is positive
    const effectiveRate = Math.max(0.1, exchangeRate - 0.2);
    const price = (costPrice / effectiveRate) * profitRate;
    return Math.ceil(price); // Round up
  }
};
