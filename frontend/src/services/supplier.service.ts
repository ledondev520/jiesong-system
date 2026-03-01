import api from '@/lib/axios';
import { Supplier, ApiResponse, PaginatedResponse } from '@/types';

export const supplierService = {
  getAll: async (params?: { page?: number; pageSize?: number; query?: string }) => {
    return api.get<ApiResponse<PaginatedResponse<Supplier>>, ApiResponse<PaginatedResponse<Supplier>>>('/suppliers', { params });
  },

  getById: async (id: string) => {
    return api.get<ApiResponse<Supplier>, ApiResponse<Supplier>>(`/suppliers/${id}`);
  },

  create: async (data: Partial<Supplier>) => {
    return api.post<ApiResponse<Supplier>, ApiResponse<Supplier>, Partial<Supplier>>('/suppliers', data);
  },

  update: async (id: string, data: Partial<Supplier>) => {
    return api.put<ApiResponse<Supplier>, ApiResponse<Supplier>, Partial<Supplier>>(`/suppliers/${id}`, data);
  },

  delete: async (id: string) => {
    return api.delete<ApiResponse<void>, ApiResponse<void>>(`/suppliers/${id}`);
  },
};
