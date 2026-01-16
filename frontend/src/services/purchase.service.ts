import api from '@/lib/axios';
import { PurchaseContract, ApiResponse, PaginatedResponse } from '@/types';

export const purchaseService = {
  getAll: async (params?: { page?: number; pageSize?: number; query?: string }) => {
    return api.get<any, ApiResponse<PaginatedResponse<PurchaseContract>>>('/purchase/contracts', { params });
  },

  getById: async (id: string) => {
    return api.get<any, ApiResponse<PurchaseContract>>(`/purchase/contracts/${id}`);
  },

  create: async (data: Partial<PurchaseContract>) => {
    return api.post<any, ApiResponse<PurchaseContract>>('/purchase/contracts', data);
  },

  update: async (id: string, data: Partial<PurchaseContract>) => {
    return api.put<any, ApiResponse<PurchaseContract>>(`/purchase/contracts/${id}`, data);
  },

  delete: async (id: string) => {
    return api.delete<any, ApiResponse<void>>(`/purchase/contracts/${id}`);
  },

  // Mock AI Parse
  parseQuote: async (text: string) => {
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
