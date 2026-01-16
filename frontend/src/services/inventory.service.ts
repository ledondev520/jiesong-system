import api from '@/lib/axios';
import { Inventory, ApiResponse, PaginatedResponse } from '@/types';

export const inventoryService = {
  getAll: async (params?: { page?: number; pageSize?: number; query?: string }) => {
    return api.get<any, ApiResponse<PaginatedResponse<Inventory>>>('/inventory', { params });
  },

  updateStatus: async (id: string, status: string) => {
    return api.put<any, ApiResponse<Inventory>>(`/inventory/${id}/status`, { status });
  }
};
