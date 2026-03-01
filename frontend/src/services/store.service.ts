import api from '@/lib/axios';
import { Store, ApiResponse, PaginatedResponse } from '@/types';

export const storeService = {
  getAll: async (params?: { page?: number; pageSize?: number; query?: string }) => {
    return api.get<ApiResponse<PaginatedResponse<Store>>, ApiResponse<PaginatedResponse<Store>>>('/stores', { params });
  },

  getById: async (id: string) => {
    return api.get<ApiResponse<Store>, ApiResponse<Store>>(`/stores/${id}`);
  },

  create: async (data: Partial<Store>) => {
    return api.post<ApiResponse<Store>, ApiResponse<Store>, Partial<Store>>('/stores', data);
  },

  update: async (id: string, data: Partial<Store>) => {
    return api.put<ApiResponse<Store>, ApiResponse<Store>, Partial<Store>>(`/stores/${id}`, data);
  },

  delete: async (id: string) => {
    return api.delete<ApiResponse<void>, ApiResponse<void>>(`/stores/${id}`);
  },
};
