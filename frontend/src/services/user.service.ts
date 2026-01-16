import api from '@/lib/axios';
import { User, ApiResponse, PaginatedResponse } from '@/types';

export const userService = {
  getAll: async (params?: { page?: number; pageSize?: number; query?: string }) => {
    return api.get<any, ApiResponse<PaginatedResponse<User>>>('/users', { params });
  },

  getById: async (id: string) => {
    return api.get<any, ApiResponse<User>>(`/users/${id}`);
  },

  create: async (data: Partial<User>) => {
    return api.post<any, ApiResponse<User>>('/users', data);
  },

  update: async (id: string, data: Partial<User>) => {
    return api.put<any, ApiResponse<User>>(`/users/${id}`, data);
  },

  delete: async (id: string) => {
    return api.delete<any, ApiResponse<void>>(`/users/${id}`);
  },
};
