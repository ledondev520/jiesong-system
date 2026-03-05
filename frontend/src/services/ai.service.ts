/**
 * Input: AI 管理端 API
 * Output: AI 会话/Token/模型管理服务
 * Pos: 前端服务层
 */

import api from '@/lib/axios';
import type { ApiResponse } from '@/types';

export interface AiSessionItem {
  sessionId: string;
  _max?: {
    createdAt?: string | null;
  } | null;
  _count?: number | { _all?: number } | null;
}

export interface AiTokenStatByModel {
  model: string;
  requests: number;
  tokens: number;
}

export interface AiTokenStats {
  period: string;
  totalRequests: number;
  totalTokens: number;
  promptTokens: number;
  outputTokens: number;
  byModel: AiTokenStatByModel[];
}

export interface AiModelsResponse {
  models: Record<string, string>;
  description: Record<string, string>;
}

export interface AiGreeting {
  greeting: string;
  songName: string;
  lyrics: string[];
  source: 'ai' | 'local';
}

export interface DashboardAnalytics {
  contracts: {
    purchase: { count: number; totalAmount: number; paidAmount: number; unpaidAmount: number };
    sales: { count: number; totalAmount: number; receivedAmount: number; receivable: number };
  };
  inventory: { productCount: number; recordCount: number; totalQuantity: number };
  shipments: {
    monthly: Array<{ month: string; count: number; amount: number; boxes: number }>;
  };
  topProducts: Array<{ productName: string; count: number; quantity: number; totalAmount: number }>;
  storeStats: Array<{ storeName: string; orderCount: number; quantity: number; totalAmount: number }>;
}

export interface TrackResult {
  salesContractId: string;
  contractNo: string;
  portName: string;
  status: string;
  eta?: string;
  storeName: string;
  productName: string;
  quantity: number;
}

export interface AiTokenUsageResponse {
  message?: string;
}

export const aiService = {
  getSessions: async () => {
    return api.get<ApiResponse<AiSessionItem[]>, ApiResponse<AiSessionItem[]>>('/ai/sessions');
  },

  deleteSession: async (sessionId: string) => {
    return api.delete<ApiResponse<null>, ApiResponse<null>>(`/ai/sessions/${sessionId}`);
  },

  getTokenStats: async (days = 30) => {
    return api.get<ApiResponse<AiTokenStats>, ApiResponse<AiTokenStats>>('/ai/token-stats', {
      params: { days },
    });
  },

  getModels: async () => {
    return api.get<ApiResponse<AiModelsResponse>, ApiResponse<AiModelsResponse>>('/ai/models');
  },

  getGreeting: async () => {
    return api.get<ApiResponse<AiGreeting>, ApiResponse<AiGreeting>>('/ai/greeting');
  },

  getDashboardAnalytics: async () => {
    return api.get<ApiResponse<DashboardAnalytics>, ApiResponse<DashboardAnalytics>>('/dashboard/analytics');
  },

  trackProduct: async (params: { product: string; store?: string }) => {
    return api.get<ApiResponse<TrackResult[]>, ApiResponse<TrackResult[]>>('/dashboard/track-product', {
      params,
    });
  },

  parseImageTokenUsage: async (message: string, imageUrl: string) => {
    return api.post<ApiResponse<AiTokenUsageResponse>, ApiResponse<AiTokenUsageResponse>, { message: string; imageUrl: string }>(
      '/ai/chat',
      { message, imageUrl },
    );
  },
};
