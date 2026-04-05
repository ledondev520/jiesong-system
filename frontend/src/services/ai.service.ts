/**
 * Input: AI 管理端 API
 * Output: AI 会话/Token/模型管理服务
 * Pos: 前端服务层
 */

import api from '@/lib/axios';
import type { ApiResponse } from '@/types';

export interface AiActionRecommendation {
  code: string;
  title: string;
  domain: string;
  priority: 'high' | 'medium' | 'low';
  executionMode: 'manual' | 'confirmable_write';
  reason: string;
  actionType?: string | null;
  params?: Record<string, unknown> | null;
  sourceTool?: string | null;
}

export interface AiPendingActionSummary {
  actionId: string;
  actionType: string;
  description: string;
  status: 'pending' | 'executed' | 'cancelled' | 'failed';
  createdAt?: string | null;
  resultDetail?: string | null;
  timeline?: Array<{
    type: 'created' | 'pending' | 'executed' | 'cancelled' | 'failed';
    status: 'pending' | 'executed' | 'cancelled' | 'failed';
    detail?: string | null;
    at: string;
  }>;
}

export interface AiGovernanceReplayProfile {
  available: boolean;
  source: 'none' | 'session-metadata' | 'session-metadata+operation-log' | 'agent-run-log' | 'agent-run-log+operation-log' | 'replay-snapshot-log' | 'replay-snapshot-log+operation-log' | 'replay-summary-record' | 'replay-summary-record+operation-log';
  level: 'none' | 'actions' | 'recommendations' | 'tools';
  evidence: {
    operationLogEvents: number;
    actionLifecycleCount: number;
  };
  counts: {
    tools: number;
    recommendations: number;
    actions: number;
  };
  summary: {
    tools: boolean;
    recommendations: boolean;
    actions: boolean;
  };
}

export interface AiSessionItem {
  sessionId: string;
  totalTokens?: number;
  lastModel?: string;
  preview?: string;
  governanceReplayProfile?: AiGovernanceReplayProfile;
  governanceReplayAvailable?: boolean;
  governanceReplaySource?: 'none' | 'session-metadata' | 'session-metadata+operation-log' | 'agent-run-log' | 'agent-run-log+operation-log' | 'replay-snapshot-log' | 'replay-snapshot-log+operation-log' | 'replay-summary-record' | 'replay-summary-record+operation-log';
  governanceReplayLevel?: 'none' | 'actions' | 'recommendations' | 'tools';
  governanceReplayCounts?: {
    tools: number;
    recommendations: number;
    actions: number;
  };
  governanceReplaySummary?: {
    tools: boolean;
    recommendations: boolean;
    actions: boolean;
  };
  agentType?: AiBusinessAgentType | null;
  routeMode?: string | null;
  domainsTouched?: string[];
  toolsUsed?: string[];
  routePlan?: {
    mode?: string | null;
    requestedAgentType?: string | null;
    preferredDomains?: string[];
    selectedDomains?: string[];
  } | null;
  toolTraceSummary?: {
    totalCalls?: number;
    readCalls?: number;
    writeCalls?: number;
    successCount?: number;
    failureCount?: number;
    totalDurationMs?: number;
  } | null;
  actionRecommendations?: AiActionRecommendation[];
  pendingActionSummary?: AiPendingActionSummary[];
  _max?: {
    createdAt?: string | null;
  } | null;
  _count?: number | { _all?: number } | null;
}

export interface AiChatHistoryItem {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  imageUrl?: string;
  governanceReplayProfile?: AiGovernanceReplayProfile;
  governanceReplayAvailable?: boolean;
  governanceReplaySource?: 'none' | 'session-metadata' | 'session-metadata+operation-log' | 'agent-run-log' | 'agent-run-log+operation-log' | 'replay-snapshot-log' | 'replay-snapshot-log+operation-log' | 'replay-summary-record' | 'replay-summary-record+operation-log';
  governanceReplayLevel?: 'none' | 'actions' | 'recommendations' | 'tools';
  governanceReplayCounts?: {
    tools: number;
    recommendations: number;
    actions: number;
  };
  governanceReplaySummary?: {
    tools: boolean;
    recommendations: boolean;
    actions: boolean;
  };
  agentType?: AiBusinessAgentType | null;
  routePlan?: {
    mode?: string | null;
    requestedAgentType?: string | null;
    preferredDomains?: string[];
    selectedDomains?: string[];
  } | null;
  selectedToolNames?: string[];
  toolTraceSummary?: {
    totalCalls?: number;
    readCalls?: number;
    writeCalls?: number;
    successCount?: number;
    failureCount?: number;
    totalDurationMs?: number;
    items?: Array<{
      name: string;
      domain: string;
      access: string;
      status: string;
      durationMs: number;
      error?: string | null;
    }>;
  } | null;
  actionRecommendations?: AiActionRecommendation[];
  pendingActionSummary?: AiPendingActionSummary[];
  promptTokens?: number;
  outputTokens?: number;
  modelUsed?: string;
  createdAt: string;
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

export interface AiAgentToolRegistryItem {
  name: string;
  domain: string;
  access: string;
  confirmationRequired: boolean;
  isComposite?: boolean;
  allowedRoles: string[];
  description: string;
}

export interface AiAgentToolRegistryResponse {
  primaryAgentType: string;
  legacyAgentTypes: string[];
  viewerRole?: string | null;
  domains?: Array<{
    domain: string;
    label: string;
    description?: string;
    toolCount: number;
    readCount: number;
    writeCount: number;
    availableCount: number;
    availableWriteCount: number;
    compositeToolCount?: number;
  }>;
  tools: AiAgentToolRegistryItem[];
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

export type AiBusinessAgentType = 'finance' | 'export' | 'executive' | 'unified';

export interface AiBusinessAgentPromptInput {
  agentType: AiBusinessAgentType;
  message: string;
  sessionId?: string;
}

export interface AgentPendingAction {
  actionId: string;
  actionType: string;
  description: string;
  params: Record<string, unknown>;
}

export interface AgentActionExecuteResult {
  actionId: string;
  actionType: string;
  description: string;
  success: boolean;
  detail: string;
}

export interface AiBusinessAgentPromptResult {
  sessionId: string;
  agent: {
    id: AiBusinessAgentType;
    label: string;
  };
  text: string;
  routePlan?: {
    mode?: string | null;
    requestedAgentType?: string | null;
    preferredDomains?: string[];
    selectedDomains?: string[];
  };
  toolTraceSummary?: {
    totalCalls?: number;
    readCalls?: number;
    writeCalls?: number;
    successCount?: number;
    failureCount?: number;
    totalDurationMs?: number;
    items?: Array<{
      name: string;
      domain: string;
      access: string;
      status: string;
      durationMs: number;
      error?: string | null;
    }>;
  };
  actionRecommendations?: AiActionRecommendation[];
  pendingActionSummary?: AiPendingActionSummary[];
  pendingActions?: AgentPendingAction[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  numTurns?: number;
  durationMs?: number;
  model?: string;
}

/** 无 sessionId 的 Token 行（如 HS 编码推荐），供用量页展示 */
export interface AiStandaloneTokenRow {
  id: string;
  model: string;
  promptTokens: number;
  outputTokens: number;
  totalTokens: number;
  requestType: string;
  /** 可选：服务端保存的 AI 输出快照 */
  detailSnapshot?: string | null;
  /** 用户输入摘要（如 HS 推荐的产品描述） */
  promptBrief?: string | null;
  createdAt: string;
}

export const aiService = {
  getSessions: async () => {
    return api.get<ApiResponse<AiSessionItem[]>, ApiResponse<AiSessionItem[]>>('/ai/sessions');
  },

  getStandaloneTokenUsage: async (limit = 50) => {
    return api.get<ApiResponse<AiStandaloneTokenRow[]>, ApiResponse<AiStandaloneTokenRow[]>>(
      '/ai/standalone-token-usage',
      { params: { limit } },
    );
  },

  getChatHistory: async (sessionId: string, page = 1, pageSize = 100) => {
    return api.get<ApiResponse<AiChatHistoryItem[]>, ApiResponse<AiChatHistoryItem[]>>(
      '/ai/history',
      { params: { sessionId, page, pageSize } },
    );
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

  getAgentToolRegistry: async () => {
    return api.get<ApiResponse<AiAgentToolRegistryResponse>, ApiResponse<AiAgentToolRegistryResponse>>('/ai/agents/tools');
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

  runBusinessAgent: async (data: AiBusinessAgentPromptInput) => {
    return api.post<ApiResponse<AiBusinessAgentPromptResult>, ApiResponse<AiBusinessAgentPromptResult>, AiBusinessAgentPromptInput>(
      '/ai/agents/prompt',
      data,
    );
  },

  executeAgentAction: async (actionId: string) => {
    return api.post<ApiResponse<AgentActionExecuteResult>, ApiResponse<AgentActionExecuteResult>, { actionId: string }>(
      '/ai/agents/execute-action',
      { actionId },
    );
  },

  cancelAgentAction: async (actionId: string) => {
    return api.post<ApiResponse<null>, ApiResponse<null>, { actionId: string }>(
      '/ai/agents/cancel-action',
      { actionId },
    );
  },
};
