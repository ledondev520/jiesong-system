import api from '@/lib/axios';
import { Container, ApiResponse, PaginatedResponse } from '@/types';

export const containerService = {
  getAll: async (params?: { page?: number; pageSize?: number; query?: string }) => {
    return api.get<any, ApiResponse<PaginatedResponse<Container>>>('/containers', { params });
  },

  getById: async (id: string) => {
    return api.get<any, ApiResponse<Container>>(`/containers/${id}`);
  },

  create: async (data: Partial<Container>) => {
    return api.post<any, ApiResponse<Container>>('/containers', data);
  },

  update: async (id: string, data: Partial<Container>) => {
    return api.put<any, ApiResponse<Container>>(`/containers/${id}`, data);
  },

  delete: async (id: string) => {
    return api.delete<any, ApiResponse<void>>(`/containers/${id}`);
  },
};
