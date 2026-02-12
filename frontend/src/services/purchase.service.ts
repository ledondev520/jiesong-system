import api from '@/lib/axios';
import { PurchaseContract, ApiResponse, PaginatedResponse } from '@/types';

export const purchaseService = {
  getAll: async (params?: { page?: number; pageSize?: number; keyword?: string }) => {
    return api.get<any, ApiResponse<PaginatedResponse<PurchaseContract>>>('/purchases', { params });
  },

  getById: async (id: string) => {
    return api.get<any, ApiResponse<PurchaseContract>>(`/purchases/${id}`);
  },

  create: async (data: Partial<PurchaseContract>) => {
    return api.post<any, ApiResponse<PurchaseContract>>('/purchases', data);
  },

  update: async (id: string, data: Partial<PurchaseContract>) => {
    return api.put<any, ApiResponse<PurchaseContract>>(`/purchases/${id}`, data);
  },

  delete: async (id: string) => {
    return api.delete<any, ApiResponse<void>>(`/purchases/${id}`);
  },

  /**
   * 职责：获取下一个采购合同编号
   * @returns 格式为 CG + 年份(2位) + 序号(5位)，如 CG2500001
   */
  getNextContractNo: async () => {
    return api.get<any, ApiResponse<{ contractNo: string }>>('/purchases/options/next-no');
  },

  /**
   * 职责：根据商品ID列表获取曾供应过这些商品的供应商ID
   * @param productIds 商品ID数组
   * @returns 供应商ID列表
   */
  getSuppliersByProducts: async (productIds: string[]) => {
    return api.post<any, ApiResponse<{ supplierIds: string[] }>>('/purchases/suppliers-by-products', { productIds });
  },

  // Mock AI Parse
  parseQuote: async (text: string): Promise<{ success: boolean; data?: Array<{ productId: string; quantity: number; unitPrice: number; unit?: string; note?: string }> }> => {
    // In real app, this calls /api/ai/parse
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          success: true,
          data: [
             { productId: '1', quantity: 100, unitPrice: 45, unit: 'sqm', note: 'AI Parsed' },
             { productId: '2', quantity: 50, unitPrice: 120, unit: 'pcs', note: 'AI Parsed' }
          ]
        });
      }, 1500);
    });
  }
};
