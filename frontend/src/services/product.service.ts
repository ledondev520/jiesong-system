import api from '@/lib/axios';
import { Product, PaginatedResponse, ApiResponse } from '@/types';

export const productService = {
  getAll: async (params?: { page?: number; pageSize?: number; keyword?: string }) => {
    return api.get<ApiResponse<PaginatedResponse<Product>>, ApiResponse<PaginatedResponse<Product>>>('/products', { params });
  },

  getById: async (id: string) => {
    return api.get<ApiResponse<Product>, ApiResponse<Product>>(`/products/${id}`);
  },

  create: async (data: Partial<Product>) => {
    return api.post<ApiResponse<Product>, ApiResponse<Product>, Partial<Product>>('/products', data);
  },

  update: async (id: string, data: Partial<Product>) => {
    return api.put<ApiResponse<Product>, ApiResponse<Product>, Partial<Product>>(`/products/${id}`, data);
  },

  delete: async (id: string) => {
    return api.delete<ApiResponse<void>, ApiResponse<void>>(`/products/${id}`);
  },
};
