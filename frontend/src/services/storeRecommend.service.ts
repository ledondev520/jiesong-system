import api from '@/lib/axios';
import { ApiResponse } from '@/types';

export interface StoreStats {
  storeId: string;
  storeName: string;
  totalAmount: number;
  productCount: number;
  categories: Array<{ name: string; amount: number; count: number }>;
}

interface Recommendation {
  productId: string;
  productName: string;
  category: string;
  subCategory: string;
  frequency: number;
  suggestedQuantity: number;
  avgUnitPrice: number;
  estimatedCost: number;
  priority: string;
}

export interface RecommendResult {
  referenceStoreCount: number;
  totalProducts: number;
  totalEstimatedCost: number;
  recommendations: Recommendation[];
  byCategory: Record<string, Recommendation[]>;
}

export interface RecommendRequest {
  referenceStoreIds?: string[];
  targetStoreName: string;
}

export const storeRecommendService = {
  getStoreStats: async () => {
    return api.get<ApiResponse<StoreStats[]>, ApiResponse<StoreStats[]>>('/store-recommend/stats');
  },

  generateRecommendations: async (payload: RecommendRequest) => {
    return api.post<ApiResponse<RecommendResult>, ApiResponse<RecommendResult>, RecommendRequest>(
      '/store-recommend/recommend',
      payload,
    );
  },
};
