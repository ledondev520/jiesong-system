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
};

