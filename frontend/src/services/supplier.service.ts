import api from '@/lib/axios';
import { Supplier, ApiResponse, PaginatedResponse } from '@/types';

export const supplierService = {
  getAll: async (params?: { page?: number; pageSize?: number; query?: string }) => {
    return api.get<any, ApiResponse<PaginatedResponse<Supplier>>>('/suppliers', { params });
  },

  getById: async (id: string) => {
    return api.get<any, ApiResponse<Supplier>>(`/suppliers/${id}`);
  },

  create: async (data: Partial<Supplier>) => {
    return api.post<any, ApiResponse<Supplier>>('/suppliers', data);
  },

  update: async (id: string, data: Partial<Supplier>) => {
    return api.put<any, ApiResponse<Supplier>>(`/suppliers/${id}`, data);
  },

  delete: async (id: string) => {
    return api.delete<any, ApiResponse<void>>(`/suppliers/${id}`);
  },
};
