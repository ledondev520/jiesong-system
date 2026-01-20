/**
 * Input: 货柜API
 * Output: 货柜服务方法
 * Pos: 前端服务层，封装货柜相关API调用
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import api from '@/lib/axios';
import { Container, ContainerItem, ApiResponse, PaginatedResponse } from '@/types';

export const containerService = {
  // 获取货柜列表
  getAll: async (params?: { page?: number; pageSize?: number; query?: string }) => {
    return api.get<any, ApiResponse<PaginatedResponse<Container>>>('/containers', { params });
  },

  // 获取货柜详情（包含装箱明细）
  getById: async (id: string) => {
    return api.get<any, ApiResponse<Container>>(`/containers/${id}`);
  },

  // 创建货柜
  create: async (data: Partial<Container>) => {
    return api.post<any, ApiResponse<Container>>('/containers', data);
  },

  // 更新货柜
  update: async (id: string, data: Partial<Container>) => {
    return api.put<any, ApiResponse<Container>>(`/containers/${id}`, data);
  },

  // 删除货柜
  delete: async (id: string) => {
    return api.delete<any, ApiResponse<void>>(`/containers/${id}`);
  },

  // 更新货柜状态
  updateStatus: async (id: string, status: string) => {
    return api.put<any, ApiResponse<Container>>(`/containers/${id}/status`, { status });
  },

  // 添加装箱明细
  addItem: async (containerId: string, data: Partial<ContainerItem>) => {
    return api.post<any, ApiResponse<ContainerItem>>(`/containers/${containerId}/items`, data);
  },

  // 更新装箱明细
  updateItem: async (containerId: string, itemId: string, data: Partial<ContainerItem>) => {
    return api.put<any, ApiResponse<ContainerItem>>(`/containers/${containerId}/items/${itemId}`, data);
  },

  // 删除装箱明细
  removeItem: async (containerId: string, itemId: string) => {
    return api.delete<any, ApiResponse<void>>(`/containers/${containerId}/items/${itemId}`);
  },
};
