import api from '@/lib/axios';
import { Store, ApiResponse, PaginatedResponse } from '@/types';

export const storeService = {
  getAll: async (params?: { page?: number; pageSize?: number; query?: string }) => {
    return api.get<any, ApiResponse<PaginatedResponse<Store>>>('/stores', { params });
  },

  getById: async (id: string) => {
    return api.get<any, ApiResponse<Store>>(`/stores/${id}`);
  },

  create: async (data: Partial<Store>) => {
    return api.post<any, ApiResponse<Store>>('/stores', data);
  },

  update: async (id: string, data: Partial<Store>) => {
    return api.put<any, ApiResponse<Store>>(`/stores/${id}`, data);
  },

  delete: async (id: string) => {
    return api.delete<any, ApiResponse<void>>(`/stores/${id}`);
  },
};
