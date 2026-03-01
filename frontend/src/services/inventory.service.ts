import api from '@/lib/axios';
import { Inventory, ApiResponse, PaginatedResponse } from '@/types';

export const inventoryService = {
  getAll: async (params?: { page?: number; pageSize?: number; keyword?: string }) => {
    return api.get<ApiResponse<PaginatedResponse<Inventory>>, ApiResponse<PaginatedResponse<Inventory>>>('/inventory', { params });
  },

  updateStatus: async (id: string, status: string) => {
    return api.put<ApiResponse<Inventory>, ApiResponse<Inventory>, { status: string }>(`/inventory/${id}/status`, { status });
  },

  batchUpdateStatus: async (ids: string[], status: string) => {
    return api.put<
      ApiResponse<{ success: number; failed: number; errors: { id: string; message: string }[] }>,
      ApiResponse<{ success: number; failed: number; errors: { id: string; message: string }[] }>,
      { ids: string[]; status: string }
    >(
      '/inventory/batch-status',
      { ids, status }
    );
  },
};
