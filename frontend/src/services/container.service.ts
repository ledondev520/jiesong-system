import api from '@/lib/axios';
import type { SalesContract, PackingItem, ApiResponse } from '@/types';
import { createCrudService } from './crudService';

type ContainerListQuery = {
  page?: number;
  pageSize?: number;
  keyword?: string;
  lite?: boolean;
};

type ContainerCreateInput = Partial<SalesContract>;
type ContainerUpdateInput = Partial<SalesContract>;

const crud = createCrudService<SalesContract, ContainerCreateInput, ContainerUpdateInput, ContainerListQuery>('/containers');

/**
 * 货柜服务。
 */
export const containerService = {
  ...crud,

  getAll: (params?: ContainerListQuery) => crud.getAll?.(params),
  getById: (id: string) => crud.getById!(id),
  create: (data: ContainerCreateInput) => crud.create!(data),
  update: (id: string, data: ContainerUpdateInput) => crud.update!(id, data),
  delete: (id: string) => crud.delete!(id),

  updateStatus: async (id: string, status: string) => {
    return api.put<ApiResponse<SalesContract>, ApiResponse<SalesContract>, { status: string }>(
      `/containers/${id}/status`,
      { status },
    );
  },

  addItem: async (containerId: string, data: Partial<PackingItem>) => {
    return api.post<ApiResponse<PackingItem>, ApiResponse<PackingItem>, Partial<PackingItem>>(
      `/containers/${containerId}/items`,
      data,
    );
  },

  updateItem: async (containerId: string, itemId: string, data: Partial<PackingItem>) => {
    return api.put<ApiResponse<PackingItem>, ApiResponse<PackingItem>, Partial<PackingItem>>(
      `/containers/${containerId}/items/${itemId}`,
      data,
    );
  },

  removeItem: async (containerId: string, itemId: string) => {
    return api.delete<ApiResponse<void>, ApiResponse<void>>(`/containers/${containerId}/items/${itemId}`);
  },
};
