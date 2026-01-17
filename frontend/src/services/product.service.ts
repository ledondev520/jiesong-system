import api from '@/lib/axios';
import { Product, PaginatedResponse, ApiResponse } from '@/types';

export const productService = {
  getAll: async (params?: { page?: number; pageSize?: number; keyword?: string }) => {
    return api.get<any, ApiResponse<PaginatedResponse<Product>>>('/products', { params });
  },

  getById: async (id: string) => {
    return api.get<any, ApiResponse<Product>>(`/products/${id}`);
  },

  create: async (data: Partial<Product>) => {
    return api.post<any, ApiResponse<Product>>('/products', data);
  },

  update: async (id: string, data: Partial<Product>) => {
    return api.put<any, ApiResponse<Product>>(`/products/${id}`, data);
  },

  delete: async (id: string) => {
    return api.delete<any, ApiResponse<void>>(`/products/${id}`);
  },
};
