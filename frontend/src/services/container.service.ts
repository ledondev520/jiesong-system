import api from '@/lib/axios';
import type { Container, ContainerItem, ApiResponse } from '@/types';
import { createCrudService } from './crudService';

type ContainerListQuery = {
  page?: number;
  pageSize?: number;
  keyword?: string;
  query?: string;
};

type ContainerCreateInput = Partial<Container>;
type ContainerUpdateInput = Partial<Container>;

const normalizeListParams = (params?: ContainerListQuery) => {
  if (!params) {
    return {};
  }
  const { query, ...rest } = params;
  return {
    ...rest,
    ...(query !== undefined ? { keyword: query } : {}),
  };
};

const crud = createCrudService<Container, ContainerCreateInput, ContainerUpdateInput, Omit<ContainerListQuery, 'query'>>(
  '/containers'
);

/**
 * 货柜服务（兼容旧容器接口）。
 */
export const containerService = {
  ...crud,

  getAll: (params?: ContainerListQuery) =>
    crud.getAll?.(normalizeListParams(params) as Omit<ContainerListQuery, 'query'>),

  updateStatus: async (id: string, status: string) => {
    return api.put<ApiResponse<Container>, ApiResponse<Container>, { status: string }>(`/containers/${id}/status`, {
      status,
    });
  },

  addItem: async (containerId: string, data: Partial<ContainerItem>) => {
    return api.post<ApiResponse<ContainerItem>, ApiResponse<ContainerItem>, Partial<ContainerItem>>(
      `/containers/${containerId}/items`,
      data,
    );
  },

  updateItem: async (containerId: string, itemId: string, data: Partial<ContainerItem>) => {
    return api.put<ApiResponse<ContainerItem>, ApiResponse<ContainerItem>, Partial<ContainerItem>>(
      `/containers/${containerId}/items/${itemId}`,
      data,
    );
  },

  removeItem: async (containerId: string, itemId: string) => {
    return api.delete<ApiResponse<void>, ApiResponse<void>>(`/containers/${containerId}/items/${itemId}`);
  },
};
