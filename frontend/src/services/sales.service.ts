/**
 * Input: 销售合同API
 * Output: 销售服务方法（含 Excel 三 Sheet 标准出口模板导出）
 * Pos: 前端服务层，封装销售合同相关API调用（含装箱管理）
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import api from '@/lib/axios';
import { SalesContract, PackingItem, ApiResponse, PaginatedResponse } from '@/types';
import { getAuthToken } from '@/lib/auth-token';

export const salesService = {
  // 获取销售合同列表
  getAll: async (params?: { page?: number; pageSize?: number; keyword?: string }) => {
    return api.get<ApiResponse<PaginatedResponse<SalesContract>>, ApiResponse<PaginatedResponse<SalesContract>>>('/sales', { params });
  },

  // 获取销售合同详情（包含装箱明细）
  getById: async (id: string) => {
    return api.get<ApiResponse<SalesContract>, ApiResponse<SalesContract>>(`/sales/${id}`);
  },

  // 创建销售合同
  create: async (data: Partial<SalesContract>) => {
    return api.post<ApiResponse<SalesContract>, ApiResponse<SalesContract>, Partial<SalesContract>>('/sales', data);
  },

  // 获取下一个销售合同编号
  getNextContractNo: async () => {
    return api.get<ApiResponse<{ contractNo: string }>, ApiResponse<{ contractNo: string }>>('/sales/options/next-no');
  },

  // 更新销售合同
  update: async (id: string, data: Partial<SalesContract>) => {
    return api.put<ApiResponse<SalesContract>, ApiResponse<SalesContract>, Partial<SalesContract>>(`/sales/${id}`, data);
  },

  // 删除销售合同
  delete: async (id: string) => {
    return api.delete<ApiResponse<void>, ApiResponse<void>>(`/sales/${id}`);
  },

  // ==================== 装箱明细管理 ====================

  // 添加装箱明细
  addPackingItem: async (salesContractId: string, data: Partial<PackingItem>) => {
    return api.post<ApiResponse<PackingItem>, ApiResponse<PackingItem>, Partial<PackingItem>>(`/sales/${salesContractId}/packing-items`, data);
  },

  // 添加销售明细
  addItem: async (
    salesContractId: string,
    data: {
      productId: string;
      storeId: string;
      quantity: number;
      unit?: string;
      costPrice: number;
      sellingPrice?: number;
      specification?: string;
      note?: string;
    }
  ) => {
    return api.post<ApiResponse<void>, ApiResponse<void>, typeof data>(`/sales/${salesContractId}/items`, data);
  },

  // 更新装箱明细
  updatePackingItem: async (salesContractId: string, itemId: string, data: Partial<PackingItem>) => {
    return api.put<ApiResponse<PackingItem>, ApiResponse<PackingItem>, Partial<PackingItem>>(`/sales/${salesContractId}/packing-items/${itemId}`, data);
  },

  // 删除装箱明细
  removePackingItem: async (salesContractId: string, itemId: string) => {
    return api.delete<ApiResponse<void>, ApiResponse<void>>(`/sales/${salesContractId}/packing-items/${itemId}`);
  },

  // ==================== 导出功能 ====================

  /**
   * 职责：导出单份出口合同为三 Sheet 标准 Excel 模板（合同信息+商品明细+装箱清单）
   * 思路：请求后端 /sales/:id/export-excel，获取 blob，触发浏览器文件下载
   * @param id - 出口合同 ID
   * @param contractNo - 合同编号，用于生成下载文件名
   */
  exportExcel: async (id: string, contractNo: string) => {
    const token = getAuthToken();
    const response = await fetch(`/api/v1/sales/${id}/export-excel`, {
      headers: {
        Authorization: token ? `Bearer ${token}` : '',
      },
    });
    if (!response.ok) {
      throw new Error(`导出失败: ${response.statusText}`);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // 优先使用服务端响应头中的文件名，回退至本地生成
    const disposition = response.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename\*=UTF-8''(.+)/i) || disposition.match(/filename="?([^"]+)"?/i);
    a.download = match ? decodeURIComponent(match[1]) : `${contractNo}_出口模板.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
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
