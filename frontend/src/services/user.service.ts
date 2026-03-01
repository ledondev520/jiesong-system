import api from '@/lib/axios';
import { User, ApiResponse, PaginatedResponse } from '@/types';

export const userService = {
  getAll: async (params?: { page?: number; pageSize?: number; query?: string }) => {
    return api.get<ApiResponse<PaginatedResponse<User>>, ApiResponse<PaginatedResponse<User>>>('/users', { params });
  },

  getById: async (id: string) => {
    return api.get<ApiResponse<User>, ApiResponse<User>>(`/users/${id}`);
  },

  create: async (data: Partial<User>) => {
    return api.post<ApiResponse<User>, ApiResponse<User>, Partial<User>>('/users', data);
  },

  update: async (id: string, data: Partial<User>) => {
    return api.put<ApiResponse<User>, ApiResponse<User>, Partial<User>>(`/users/${id}`, data);
  },

  delete: async (id: string) => {
    return api.delete<ApiResponse<void>, ApiResponse<void>>(`/users/${id}`);
  },
};
