/**
 * Input: 销售合同API
 * Output: 销售服务方法
 * Pos: 前端服务层，封装销售合同相关API调用（含装箱管理）
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import api from '@/lib/axios';
import { SalesContract, PackingItem, ApiResponse, PaginatedResponse } from '@/types';

export const salesService = {
  // 获取销售合同列表
  getAll: async (params?: { page?: number; pageSize?: number; query?: string }) => {
    return api.get<any, ApiResponse<PaginatedResponse<SalesContract>>>('/sales', { params });
  },

  // 获取销售合同详情（包含装箱明细）
  getById: async (id: string) => {
    return api.get<any, ApiResponse<SalesContract>>(`/sales/${id}`);
  },

  // 创建销售合同
  create: async (data: Partial<SalesContract>) => {
    return api.post<any, ApiResponse<SalesContract>>('/sales', data);
  },

  // 更新销售合同
  update: async (id: string, data: Partial<SalesContract>) => {
    return api.put<any, ApiResponse<SalesContract>>(`/sales/${id}`, data);
  },

  // 删除销售合同
  delete: async (id: string) => {
    return api.delete<any, ApiResponse<void>>(`/sales/${id}`);
  },

  // ==================== 装箱明细管理 ====================

  // 添加装箱明细
  addPackingItem: async (salesContractId: string, data: Partial<PackingItem>) => {
    return api.post<any, ApiResponse<PackingItem>>(`/sales/${salesContractId}/packing-items`, data);
  },

  // 更新装箱明细
  updatePackingItem: async (salesContractId: string, itemId: string, data: Partial<PackingItem>) => {
    return api.put<any, ApiResponse<PackingItem>>(`/sales/${salesContractId}/packing-items/${itemId}`, data);
  },

  // 删除装箱明细
  removePackingItem: async (salesContractId: string, itemId: string) => {
    return api.delete<any, ApiResponse<void>>(`/sales/${salesContractId}/packing-items/${itemId}`);
  },

  // ==================== 工具方法 ====================

  // 计算推荐售价
  calculatePrice: (costPrice: number, exchangeRate: number, profitRate: number) => {
    // Formula: Cost / (Rate - 0.2) * Profit
    // Ensure rate - 0.2 is positive
    const effectiveRate = Math.max(0.1, exchangeRate - 0.2);
    const price = (costPrice / effectiveRate) * profitRate;
    return Math.ceil(price); // Round up
  }
};
